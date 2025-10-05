-- ===================================================================
-- Script de correction pour le problème de modification des sillons
-- ET pour le problème des gares desservies manquantes dans le JSON
-- ===================================================================
-- Ce script corrige les problèmes identifiés dans le système de stockage
-- des jours de circulation et ajoute la colonne is_substitution manquante
-- ===================================================================

USE `horaires`;

-- 1. Ajouter la colonne is_substitution si elle n'existe pas déjà
ALTER TABLE `sillons`
ADD COLUMN IF NOT EXISTS `is_substitution` TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Indique si ce sillon peut être utilisé comme substitution pendant les travaux'
AFTER `stops_signature`;

-- 2. Mettre à jour la vue de compatibilité pour inclure la nouvelle colonne
CREATE OR REPLACE VIEW `schedules` AS SELECT * FROM `sillons`;

-- 3. Recréer la procédure create_schedule avec le support d'is_substitution
DROP PROCEDURE IF EXISTS create_schedule;
DELIMITER $$
CREATE PROCEDURE create_schedule(
  IN p_ligne_id INT UNSIGNED,
  IN p_train_number VARCHAR(20),
  IN p_train_type VARCHAR(50),
  IN p_rolling_stock VARCHAR(100),
  IN p_departure_station_id INT UNSIGNED,
  IN p_arrival_station_id INT UNSIGNED,
  IN p_departure_time TIME,
  IN p_arrival_time TIME,
  IN p_days_mask TINYINT UNSIGNED,
  IN p_days_mask_list VARCHAR(32),
  IN p_flag_holidays TINYINT,
  IN p_flag_sundays TINYINT,
  IN p_flag_custom TINYINT,
  IN p_is_substitution TINYINT,
  IN p_stops JSON
)
BEGIN
  INSERT INTO `sillons`(
    ligne_id, train_number, train_type, rolling_stock,
    departure_station_id, arrival_station_id,
    departure_time, arrival_time,
    days_mask, days_mask_list, flag_holidays, flag_sundays, flag_custom, is_substitution
  ) VALUES (
    p_ligne_id, p_train_number, p_train_type, p_rolling_stock,
    p_departure_station_id, p_arrival_station_id,
    p_departure_time, p_arrival_time,
    p_days_mask, p_days_mask_list, p_flag_holidays, p_flag_sundays, p_flag_custom, p_is_substitution
  );
  SET @new_id = LAST_INSERT_ID();
  CALL set_schedule_stops(@new_id, p_stops);
  SELECT @new_id AS schedule_id;
END $$
DELIMITER ;

-- 4. Correction de la procédure rebuild_schedule_stops_json pour inclure toutes les gares desservies
DROP PROCEDURE IF EXISTS rebuild_schedule_stops_json;
DELIMITER $$
CREATE PROCEDURE rebuild_schedule_stops_json(IN p_schedule_id INT UNSIGNED)
BEGIN
  DECLARE nb INT DEFAULT 0;
  DECLARE dep_station_name VARCHAR(190);
  DECLARE arr_station_name VARCHAR(190);
  DECLARE dep_time VARCHAR(5);
  DECLARE arr_time VARCHAR(5);
  DECLARE max_order INT DEFAULT 0;

  SELECT COUNT(*) INTO nb FROM schedule_stops WHERE schedule_id = p_schedule_id;
  SELECT IFNULL(MAX(stop_order), 0) INTO max_order FROM schedule_stops WHERE schedule_id = p_schedule_id;

  -- Récupérer infos du sillon (nom gares et horaires)
  SELECT ds.name, as2.name, DATE_FORMAT(s.departure_time,'%H:%i'), DATE_FORMAT(s.arrival_time,'%H:%i')
    INTO dep_station_name, arr_station_name, dep_time, arr_time
  FROM sillons s
  JOIN stations ds ON ds.id = s.departure_station_id
  JOIN stations as2 ON as2.id = s.arrival_station_id
  WHERE s.id = p_schedule_id;

  IF nb = 0 THEN
    -- Aucun arrêt défini : trajet direct origine -> terminus
    SET @agg = JSON_OBJECT(
      'Origine', JSON_OBJECT('station_name', dep_station_name, 'arrival_time', NULL, 'departure_time', dep_time, 'dwell_minutes', NULL),
      'Desservies', JSON_ARRAY(),
      'Terminus', JSON_OBJECT('station_name', arr_station_name, 'arrival_time', arr_time, 'departure_time', NULL, 'dwell_minutes', NULL)
    );
    SET @sig = NULL;
  ELSE
    -- Desservies : toutes les gares sauf la dernière (terminus)
    -- Inclut la première gare (après origine) et toutes les gares intermédiaires
    SELECT IFNULL(CONCAT('[', GROUP_CONCAT(
      JSON_OBJECT(
        'station_name', s.name,
        'arrival_time', IFNULL(DATE_FORMAT(st.arrival_time,'%H:%i'), NULL),
        'departure_time', IFNULL(DATE_FORMAT(st.departure_time,'%H:%i'), NULL),
        'dwell_minutes', CASE
          WHEN st.arrival_time IS NULL OR st.departure_time IS NULL THEN NULL
          ELSE GREATEST(0, (TIME_TO_SEC(st.departure_time) - TIME_TO_SEC(st.arrival_time)) DIV 60)
        END
      ) ORDER BY st.stop_order SEPARATOR ','
    ), ']'), '[]')
    INTO @desservies
    FROM schedule_stops st
    JOIN stations s ON s.id = st.station_id
    WHERE st.schedule_id = p_schedule_id
      AND st.stop_order < max_order;  -- Exclut seulement le dernier arrêt (terminus)

    -- Récupérer les informations du terminus (dernier arrêt)
    SELECT s.name, DATE_FORMAT(st.arrival_time,'%H:%i')
      INTO @terminus_name, @terminus_arrival
    FROM schedule_stops st
    JOIN stations s ON s.id = st.station_id
    WHERE st.schedule_id = p_schedule_id
      AND st.stop_order = max_order;

    SET @agg = JSON_OBJECT(
      'Origine', JSON_OBJECT('station_name', dep_station_name, 'arrival_time', NULL, 'departure_time', dep_time, 'dwell_minutes', NULL),
      'Desservies', CAST(@desservies AS JSON),
      'Terminus', JSON_OBJECT('station_name', IFNULL(@terminus_name, arr_station_name), 'arrival_time', IFNULL(@terminus_arrival, arr_time), 'departure_time', NULL, 'dwell_minutes', NULL)
    );

    SELECT GROUP_CONCAT(st.station_id ORDER BY st.stop_order SEPARATOR '-') INTO @sig
    FROM schedule_stops st
    WHERE st.schedule_id = p_schedule_id;
  END IF;

  UPDATE `sillons`
    SET stops_json = COALESCE(@agg, '{"Origine":null,"Desservies":[],"Terminus":null}'),
        stops_signature = @sig
  WHERE id = p_schedule_id;
END $$
DELIMITER ;

-- 5. Fonction utilitaire pour convertir le masque de bits en liste
DROP FUNCTION IF EXISTS bitmask_to_days_list;
DELIMITER $$
CREATE FUNCTION bitmask_to_days_list(p_mask TINYINT UNSIGNED)
RETURNS VARCHAR(32) DETERMINISTIC
BEGIN
  DECLARE result VARCHAR(32) DEFAULT '';
  DECLARE day_num INT DEFAULT 1;

  WHILE day_num <= 7 DO
    IF (p_mask & (1 << (day_num - 1))) > 0 THEN
      IF result != '' THEN
        SET result = CONCAT(result, ';');
      END IF;
      SET result = CONCAT(result, day_num);
    END IF;
    SET day_num = day_num + 1;
  END WHILE;

  RETURN NULLIF(result, '');
END $$
DELIMITER ;

-- 6. Mise à jour des sillons existants qui n'ont pas de days_mask_list
UPDATE `sillons`
SET days_mask_list = bitmask_to_days_list(days_mask)
WHERE days_mask_list IS NULL OR days_mask_list = '';

-- 7. Régénérer le JSON des arrêts pour tous les sillons existants
-- pour appliquer la nouvelle logique des gares desservies
CALL rebuild_schedule_stops_json(
  (SELECT id FROM sillons ORDER BY id LIMIT 1)
);

-- Régénérer pour tous les sillons (peut prendre du temps selon le nombre de sillons)
SET @sql = '';
SELECT GROUP_CONCAT(
  CONCAT('CALL rebuild_schedule_stops_json(', id, ');')
  SEPARATOR ' '
) INTO @sql
FROM sillons;

-- Exécuter la régénération pour tous les sillons si des sillons existent
SET @has_sillons = (SELECT COUNT(*) FROM sillons);
IF @has_sillons > 0 THEN
  SET @sql_exec = CONCAT(
    'BEGIN ',
    IFNULL(@sql, ''),
    ' END'
  );
  -- Note: Cette partie nécessiterait une exécution manuelle sillon par sillon
  -- ou un script externe pour éviter les limitations de MySQL sur les requêtes dynamiques
END IF;

-- 8. Nettoyage temporaire
DROP FUNCTION IF EXISTS bitmask_to_days_list;

-- ===================================================================
-- Vérifications finales
-- ===================================================================

-- Vérifier que tous les sillons ont maintenant une days_mask_list cohérente
SELECT
  COUNT(*) as total_sillons,
  COUNT(CASE WHEN days_mask_list IS NOT NULL AND days_mask_list != '' THEN 1 END) as sillons_avec_days_list,
  COUNT(CASE WHEN is_substitution IS NOT NULL THEN 1 END) as sillons_avec_substitution
FROM sillons;

-- Afficher quelques exemples pour vérification
SELECT id, days_mask, days_mask_list, is_substitution,
       LEFT(stops_json, 100) as stops_json_preview
FROM sillons
LIMIT 5;

SELECT 'Migration terminée avec succès !' as status;
SELECT 'IMPORTANT: Régénérez manuellement le stops_json en modifiant et sauvegardant chaque sillon pour appliquer la nouvelle logique des gares desservies.' as note;
