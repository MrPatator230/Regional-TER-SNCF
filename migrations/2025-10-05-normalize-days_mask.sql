-- Migration: Normaliser l'enregistrement des jours de circulation en numéros 1..7 (Lun=1 .. Dim=7)
-- Date: 2025-10-05
-- Usage: exécuter sur la base `horaires` (faire une sauvegarde avant, ex: mysqldump)

USE `horaires`;

-- IMPORTANT: sauvegarde recommandée avant d'exécuter ce script
-- Exemple (hors script) :
-- mysqldump -u user -p horaires > horaires_backup_2025-10-05.sql

-- 0) Création du répertoire et remarque
-- Ce script crée 3 fonctions utilitaires puis applique des mises à jour en plusieurs étapes.
-- Les fonctions sont écrites pour être compatibles avec MySQL / MariaDB (déclarations en tête, pas d'ITERATE sans labels, pas de variables utilisateur non nécessaires).

-- 1) Ajouter la colonne days_mask_list si absente
-- Note: certaines versions de MySQL/MariaDB ne supportent pas ADD COLUMN IF NOT EXISTS,
-- on utilise donc information_schema + PREPARE/EXECUTE pour être compatible.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sillons'
    AND COLUMN_NAME = 'days_mask_list'
);
SET @qry = IF(@col_exists = 0,
  'ALTER TABLE `sillons` ADD COLUMN `days_mask_list` VARCHAR(64) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @qry;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Fonction utilitaire: bitmask (TINYINT) -> liste '1;2;7'
DROP FUNCTION IF EXISTS bitmask_to_days_list;
DELIMITER $$
CREATE FUNCTION bitmask_to_days_list(p_mask TINYINT UNSIGNED)
RETURNS VARCHAR(64) DETERMINISTIC
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE res VARCHAR(64) DEFAULT '';
  DECLARE b INT;

  IF p_mask IS NULL THEN
    RETURN NULL;
  END IF;

  SET i = 1;
  WHILE i <= 7 DO
    SET b = (p_mask & (1 << (i - 1)));
    IF b <> 0 THEN
      IF res = '' THEN
        SET res = CAST(i AS CHAR);
      ELSE
        SET res = CONCAT(res, ';', CAST(i AS CHAR));
      END IF;
    END IF;
    SET i = i + 1;
  END WHILE;

  RETURN NULLIF(res, '');
END $$
DELIMITER ;

-- 3) Fonction utilitaire: normalise une chaîne variée en '1;2;3' triée (supporte: nombres, 0-based, noms jour FR, séparateurs , / | espace ; et chaînes bit '1010101')
DROP FUNCTION IF EXISTS normalize_days_list;
DELIMITER $$
CREATE FUNCTION normalize_days_list(p VARCHAR(255))
RETURNS VARCHAR(64) DETERMINISTIC
BEGIN
  -- déclarations (TOUJOURS en tête)
  DECLARE i INT DEFAULT 1;
  DECLARE tok VARCHAR(128) DEFAULT '';
  DECLARE n INT DEFAULT NULL;
  DECLARE key3 VARCHAR(10) DEFAULT '';
  DECLARE tmp VARCHAR(255) DEFAULT '';
  DECLARE res VARCHAR(64) DEFAULT '';
  DECLARE found TINYINT DEFAULT 0;
  DECLARE sorted VARCHAR(64) DEFAULT '';
  DECLARE k INT DEFAULT 1;
  DECLARE j INT DEFAULT 1;
  DECLARE bit CHAR(1) DEFAULT '';

  IF p IS NULL OR TRIM(p) = '' THEN
    RETURN NULL;
  END IF;

  -- uniformiser séparateurs vers ';'
  SET tmp = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p, ',', ';'), ' ', ';'), '/', ';'), '|', ';'), '\\t', ';');
  -- réduire doubles ;; en single ;
  WHILE INSTR(tmp, ';;') > 0 DO
    SET tmp = REPLACE(tmp, ';;', ';');
  END WHILE;

  -- parcourir tokens (jusqu'à 12 pour être tolérant)
  SET i = 1;
  WHILE i <= 12 DO
    SET tok = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(tmp, ';', i), ';', -1));
    IF tok = '' THEN
      SET i = i + 1;
    ELSE
      SET n = NULL;
      SET key3 = LOWER(LEFT(tok, 3));

      -- reconnaître une chaîne binaire de 7 chiffres ex: 1010101
      IF tok REGEXP '^[01]{7}$' THEN
        SET j = 1;
        WHILE j <= 7 DO
          SET bit = SUBSTRING(tok, j, 1);
          IF bit = '1' THEN
            -- ajouter j si absent
            SET found = INSTR(CONCAT(';', res, ';'), CONCAT(';', CAST(j AS CHAR), ';')) > 0;
            IF NOT found THEN
              IF res = '' THEN SET res = CAST(j AS CHAR); ELSE SET res = CONCAT(res, ';', CAST(j AS CHAR)); END IF;
            END IF;
          END IF;
          SET j = j + 1;
        END WHILE;
      ELSEIF tok REGEXP '^[0-9]+$' THEN
        -- purement numérique
        SET n = CAST(tok AS UNSIGNED);
        -- si format 0..6 (bit index) convertir en 1..7
        IF n BETWEEN 0 AND 6 THEN
          SET n = n + 1;
        END IF;
        IF NOT (n BETWEEN 1 AND 7) THEN SET n = NULL; END IF;
        IF n IS NOT NULL THEN
          SET found = INSTR(CONCAT(';', res, ';'), CONCAT(';', CAST(n AS CHAR), ';')) > 0;
          IF NOT found THEN
            IF res = '' THEN SET res = CAST(n AS CHAR); ELSE SET res = CONCAT(res, ';', CAST(n AS CHAR)); END IF;
          END IF;
        END IF;
      ELSE
        -- map noms jours FR (3 premières lettres)
        CASE key3
          WHEN 'lun' THEN SET n = 1;
          WHEN 'mar' THEN SET n = 2;
          WHEN 'mer' THEN SET n = 3;
          WHEN 'jeu' THEN SET n = 4;
          WHEN 'ven' THEN SET n = 5;
          WHEN 'sam' THEN SET n = 6;
          WHEN 'dim' THEN SET n = 7;
          ELSE SET n = NULL;
        END CASE;
        IF n IS NOT NULL THEN
          SET found = INSTR(CONCAT(';', res, ';'), CONCAT(';', CAST(n AS CHAR), ';')) > 0;
          IF NOT found THEN
            IF res = '' THEN SET res = CAST(n AS CHAR); ELSE SET res = CONCAT(res, ';', CAST(n AS CHAR)); END IF;
          END IF;
        END IF;
      END IF;

      SET i = i + 1;
    END IF;
  END WHILE;

  IF res = '' THEN
    RETURN NULL;
  END IF;

  -- trier les numéros dans l'ordre 1..7
  SET k = 1;
  WHILE k <= 7 DO
    IF INSTR(CONCAT(';', res, ';'), CONCAT(';', CAST(k AS CHAR), ';')) > 0 THEN
      IF sorted = '' THEN SET sorted = CAST(k AS CHAR); ELSE SET sorted = CONCAT(sorted, ';', CAST(k AS CHAR)); END IF;
    END IF;
    SET k = k + 1;
  END WHILE;

  RETURN NULLIF(sorted, '');
END $$
DELIMITER ;

-- 4) Fonction utilitaire: '1;3;7' -> bitmask (TINYINT)
DROP FUNCTION IF EXISTS days_list_to_mask;
DELIMITER $$
CREATE FUNCTION days_list_to_mask(p VARCHAR(255))
RETURNS TINYINT UNSIGNED DETERMINISTIC
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE tok VARCHAR(64) DEFAULT '';
  DECLARE mask TINYINT UNSIGNED DEFAULT 0;
  DECLARE n_local INT DEFAULT NULL;

  IF p IS NULL OR TRIM(p) = '' THEN
    RETURN 0;
  END IF;

  WHILE i <= 12 DO
    SET tok = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p, ';', i), ';', -1));
    IF tok = '' THEN
      SET i = i + 1;
    ELSE
      IF tok REGEXP '^[0-9]+$' THEN
        SET n_local = CAST(tok AS UNSIGNED);
        IF n_local BETWEEN 1 AND 7 THEN
          SET mask = mask | (1 << (n_local - 1));
        END IF;
      END IF;
      SET i = i + 1;
    END IF;
  END WHILE;

  RETURN mask;
END $$
DELIMITER ;

-- 5) Normalisation des données existantes
-- 5.a Normaliser les rows qui ont days_mask_list non nul mais potentiellement en format '0;2' ou 'lun;mer' ou '1010101'
UPDATE `sillons`
SET days_mask_list = normalize_days_list(days_mask_list)
WHERE days_mask_list IS NOT NULL AND TRIM(days_mask_list) <> '';

-- 5.b Remplir days_mask_list à partir du days_mask (bitmask) pour les lignes vides
UPDATE `sillons`
SET days_mask_list = bitmask_to_days_list(days_mask)
WHERE (days_mask_list IS NULL OR TRIM(days_mask_list) = '')
  AND days_mask IS NOT NULL;

-- 5.c Mettre à jour days_mask depuis days_mask_list (pour cohérence)
UPDATE `sillons`
SET days_mask = days_list_to_mask(days_mask_list)
WHERE days_mask_list IS NOT NULL AND TRIM(days_mask_list) <> '';

-- 6) Vérifications rapides: afficher quelques exemples
SELECT id, days_mask, days_mask_list
FROM `sillons`
ORDER BY id DESC
LIMIT 20;

-- Optionnel: supprimer les fonctions utilitaires si tu veux les retirer après vérification
-- DROP FUNCTION IF EXISTS normalize_days_list;
-- DROP FUNCTION IF EXISTS days_list_to_mask;
-- DROP FUNCTION IF EXISTS bitmask_to_days_list;

-- FIN
