-- ===================================================================
-- MIGRATION: Correction complète du système stops_json
-- Date: 2025-01-06
-- Description: Recoder entièrement le système de stockage des gares
--              désservies pour enregistrer TOUTES les gares de l'onglet "Arrêts"
-- ===================================================================

USE `horaires`;

-- Sauvegarde des données actuelles (au cas où)
CREATE TABLE IF NOT EXISTS `_backup_stops_json_20250106` AS
SELECT id, stops_json, stops_signature, created_at
FROM sillons
WHERE stops_json IS NOT NULL;

-- ===================================================================
-- 1. SUPPRESSION DES ANCIENS TRIGGERS ET PROCÉDURES
-- ===================================================================
DROP TRIGGER IF EXISTS trg_schedule_stops_ai;
DROP TRIGGER IF EXISTS trg_schedule_stops_au;
DROP TRIGGER IF EXISTS trg_schedule_stops_ad;
DROP PROCEDURE IF EXISTS rebuild_schedule_stops_json;

-- ===================================================================
-- 2. NOUVELLE PROCÉDURE COMPLÈTE rebuild_schedule_stops_json
-- Génère un JSON avec structure: {"Origine": ..., "Desservies": [...], "Terminus": ...}
-- INCLUT TOUTES LES GARES du tab "Arrêts" dans "Desservies" avec construction manuelle
-- ===================================================================
DELIMITER $$
CREATE PROCEDURE rebuild_schedule_stops_json(IN p_schedule_id INT UNSIGNED)
BEGIN
  DECLARE dep_station_name VARCHAR(190);
  DECLARE arr_station_name VARCHAR(190);
  DECLARE dep_time VARCHAR(5);
  DECLARE arr_time VARCHAR(5);
  DECLARE nb_stops INT DEFAULT 0;
  DECLARE done INT DEFAULT FALSE;
  DECLARE stop_station VARCHAR(190);
  DECLARE stop_arrival VARCHAR(5);
  DECLARE stop_departure VARCHAR(5);
  DECLARE stop_dwell INT;
  DECLARE desservies_json TEXT DEFAULT '';

  -- Curseur pour parcourir les arrêts
  DECLARE stops_cursor CURSOR FOR
    SELECT s.name,
           IFNULL(DATE_FORMAT(st.arrival_time,'%H:%i'), NULL),
           IFNULL(DATE_FORMAT(st.departure_time,'%H:%i'), NULL),
           CASE
             WHEN st.arrival_time IS NULL OR st.departure_time IS NULL THEN NULL
             ELSE GREATEST(0, (TIME_TO_SEC(st.departure_time) - TIME_TO_SEC(st.arrival_time)) DIV 60)
           END
    FROM schedule_stops st
    JOIN stations s ON s.id = st.station_id
    WHERE st.schedule_id = p_schedule_id
    ORDER BY st.stop_order;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  -- Récupérer les informations du sillon (gares de départ/arrivée et horaires)
  SELECT ds.name, as2.name, DATE_FORMAT(s.departure_time,'%H:%i'), DATE_FORMAT(s.arrival_time,'%H:%i')
    INTO dep_station_name, arr_station_name, dep_time, arr_time
  FROM sillons s
  JOIN stations ds ON ds.id = s.departure_station_id
  JOIN stations as2 ON as2.id = s.arrival_station_id
  WHERE s.id = p_schedule_id;

  -- Compter le nombre d'arrêts intermédiaires
  SELECT COUNT(*) INTO nb_stops FROM schedule_stops WHERE schedule_id = p_schedule_id;

  IF nb_stops = 0 THEN
    -- Aucun arrêt intermédiaire : trajet direct origine -> terminus
    SET @final_json = JSON_OBJECT(
      'Origine', JSON_OBJECT(
        'arrival_time', NULL,
        'station_name', dep_station_name,
        'dwell_minutes', NULL,
        'departure_time', dep_time
      ),
      'Desservies', JSON_ARRAY(),
      'Terminus', JSON_OBJECT(
        'arrival_time', arr_time,
        'station_name', arr_station_name,
        'dwell_minutes', NULL,
        'departure_time', NULL
      )
    );
    SET @signature = CONCAT('DIRECT:', p_schedule_id);
  ELSE
    -- Construire manuellement le tableau des gares désservies
    SET desservies_json = '[';

    OPEN stops_cursor;

    stops_loop: LOOP
      FETCH stops_cursor INTO stop_station, stop_arrival, stop_departure, stop_dwell;
      IF done THEN
        LEAVE stops_loop;
      END IF;

      -- Ajouter virgule si ce n'est pas le premier élément
      IF desservies_json != '[' THEN
        SET desservies_json = CONCAT(desservies_json, ',');
      END IF;

      -- Construire l'objet JSON pour cette gare
      SET desservies_json = CONCAT(desservies_json, '{',
        '"arrival_time":', IF(stop_arrival IS NULL, 'null', CONCAT('"', stop_arrival, '"')), ',',
        '"station_name":"', stop_station, '",',
        '"dwell_minutes":', IF(stop_dwell IS NULL, 'null', stop_dwell), ',',
        '"departure_time":', IF(stop_departure IS NULL, 'null', CONCAT('"', stop_departure, '"')),
        '}'
      );
    END LOOP;

    CLOSE stops_cursor;

    SET desservies_json = CONCAT(desservies_json, ']');

    -- Construction du JSON final avec la structure attendue
    SET @final_json = JSON_OBJECT(
      'Origine', JSON_OBJECT(
        'arrival_time', NULL,
        'station_name', dep_station_name,
        'dwell_minutes', NULL,
        'departure_time', dep_time
      ),
      'Desservies', CAST(desservies_json AS JSON),
      'Terminus', JSON_OBJECT(
        'arrival_time', arr_time,
        'station_name', arr_station_name,
        'dwell_minutes', NULL,
        'departure_time', NULL
      )
    );

    -- Génération de la signature pour optimisation
    SELECT CONCAT(
      'FULL:', p_schedule_id, '-',
      GROUP_CONCAT(st.station_id ORDER BY st.stop_order SEPARATOR '-')
    ) INTO @signature
    FROM schedule_stops st
    WHERE st.schedule_id = p_schedule_id;
  END IF;

  -- Mise à jour du sillon avec le JSON complet
  UPDATE `sillons`
    SET stops_json = @final_json,
        stops_signature = @signature,
        updated_at = CURRENT_TIMESTAMP
  WHERE id = p_schedule_id;

END $$
DELIMITER ;
