-- Migration SQL (sans fonctions) : normaliser days_mask au format '1;2;3;4;5' (1=Lundi ... 7=Dimanche)
-- Fichier : scripts/migrate_days_mask_no_funcs.sql
-- Remplacez `sillons` par le nom réel de la table avant exécution.

-- Backup recommandé :
-- mysqldump -u <user> -p <database> sillons > sillons.backup.sql

-- 1) Ajouter colonne de destination (safe: vérifie existence avant ALTER)
-- Certaines versions de MySQL n'acceptent pas `ADD COLUMN IF NOT EXISTS`.
-- Le bloc suivant vérifie la présence de la colonne et n'exécute ALTER TABLE que si elle est absente.

SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sillons' AND COLUMN_NAME = 'days_mask_list';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `sillons` ADD COLUMN `days_mask_list` VARCHAR(32) DEFAULT NULL',
  'SELECT "COLUMN days_mask_list ALREADY EXISTS"');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Cas A : colonne entière (bitmask) -> days_mask_list (pas de fonction)
UPDATE `sillons`
SET days_mask_list = CONCAT_WS(';',
  IF((CAST(days_mask AS SIGNED) & 1) <> 0, '1', NULL),
  IF((CAST(days_mask AS SIGNED) & 2) <> 0, '2', NULL),
  IF((CAST(days_mask AS SIGNED) & 4) <> 0, '3', NULL),
  IF((CAST(days_mask AS SIGNED) & 8) <> 0, '4', NULL),
  IF((CAST(days_mask AS SIGNED) & 16) <> 0, '5', NULL),
  IF((CAST(days_mask AS SIGNED) & 32) <> 0, '6', NULL),
  IF((CAST(days_mask AS SIGNED) & 64) <> 0, '7', NULL)
)
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[0-9]+$'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 3) Cas B : colonne chaîne binaire '1010101' (7 chars) -> days_mask_list
UPDATE `sillons`
SET days_mask_list = CONCAT_WS(';',
  IF(SUBSTRING(days_mask,1,1)='1','1',NULL),
  IF(SUBSTRING(days_mask,2,1)='1','2',NULL),
  IF(SUBSTRING(days_mask,3,1)='1','3',NULL),
  IF(SUBSTRING(days_mask,4,1)='1','4',NULL),
  IF(SUBSTRING(days_mask,5,1)='1','5',NULL),
  IF(SUBSTRING(days_mask,6,1)='1','6',NULL),
  IF(SUBSTRING(days_mask,7,1)='1','7',NULL)
)
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[01]{7}$'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 4) Cas C : colonne déjà sous forme '1;2;3' ou '1,2,3' -> nettoyage
UPDATE `sillons`
SET days_mask_list = TRIM(BOTH ';' FROM REPLACE(REPLACE(days_mask, ' ', ''), ',', ';'))
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[0-9 ,;]+$'
  AND days_mask REGEXP '[,;]'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 5) Cas D : colonnes alternatives (days, running_days_str)
UPDATE `sillons`
SET days_mask_list = TRIM(BOTH ';' FROM REPLACE(REPLACE(days, ' ', ''), ',', ';'))
WHERE days IS NOT NULL
  AND days_mask_list IS NULL;

UPDATE `sillons`
SET days_mask_list = CONCAT_WS(';',
  IF(SUBSTRING(running_days_str,1,1)='1','1',NULL),
  IF(SUBSTRING(running_days_str,2,1)='1','2',NULL),
  IF(SUBSTRING(running_days_str,3,1)='1','3',NULL),
  IF(SUBSTRING(running_days_str,4,1)='1','4',NULL),
  IF(SUBSTRING(running_days_str,5,1)='1','5',NULL),
  IF(SUBSTRING(running_days_str,6,1)='1','6',NULL),
  IF(SUBSTRING(running_days_str,7,1)='1','7',NULL)
)
WHERE running_days_str IS NOT NULL
  AND running_days_str REGEXP '^[01]{7}$'
  AND days_mask_list IS NULL;

-- 6) Optionnel : normaliser les doublons / format
-- S'assurer que le résultat ne contient que numéros 1..7 séparés par ';'
-- Cette étape utilise une sous-requête générique ; si votre SGBD refuse la sous-requête dans UPDATE,
-- exécutez la SELECT qui suit pour inspecter puis adaptez manuellement.

-- SELECT pour contrôle : décompose days_mask_list en tokens
SELECT id, days_mask_list FROM `sillons` WHERE days_mask_list IS NOT NULL LIMIT 50;

-- Si tout est OK, vous pouvez renommer les colonnes (optionnel)
-- ALTER TABLE sillons CHANGE COLUMN days_mask days_mask_old VARCHAR(255);
-- ALTER TABLE sillons CHANGE COLUMN days_mask_list days_mask VARCHAR(32);

