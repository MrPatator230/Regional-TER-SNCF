-- Migration SQL: normaliser days_mask au format '1;2;3;4;5' (1=Lundi ... 7=Dimanche)
-- Fichier généré : scripts/migrate_days_mask.sql
-- IMPORTANT : faire une sauvegarde avant exécution !
-- Remplacez `your_table` par le nom réel de la table contenant les sillons.
-- Si vous préférez remplacer directement la colonne `days_mask`, ajustez la dernière section.

-- RECOMMANDATION : faire un dump avant d'exécuter :
-- mysqldump -u <user> -p <database> your_table > your_table.backup.sql

-- 1) Création d'une colonne de destination non destructive
ALTER TABLE `sillons`
  ADD COLUMN IF NOT EXISTS `days_mask_list` VARCHAR(32) DEFAULT NULL;

-- 2) Fonction utilitaire : convertir entier bitmask (LSB = lundi) -> '1;2;3' (MySQL)
DROP FUNCTION IF EXISTS `bitmask_to_days_list`;
DELIMITER $$
CREATE FUNCTION `bitmask_to_days_list`(m INT)
RETURNS VARCHAR(32) DETERMINISTIC
BEGIN
  RETURN CONCAT_WS(';',
    IF((m & 1) <> 0, '1', NULL),
    IF((m & 2) <> 0, '2', NULL),
    IF((m & 4) <> 0, '3', NULL),
    IF((m & 8) <> 0, '4', NULL),
    IF((m & 16) <> 0, '5', NULL),
    IF((m & 32) <> 0, '6', NULL),
    IF((m & 64) <> 0, '7', NULL)
  );
END$$
DELIMITER ;

-- 3) Fonction utilitaire : convertir chaîne binaire '1010101' (pos1 = lundi) -> '1;3;5'
DROP FUNCTION IF EXISTS `binstr_to_days_list`;
DELIMITER $$
CREATE FUNCTION `binstr_to_days_list`(s VARCHAR(7))
RETURNS VARCHAR(32) DETERMINISTIC
BEGIN
  IF(s IS NULL OR CHAR_LENGTH(s) < 7) THEN
    RETURN NULL;
  END IF;
  RETURN CONCAT_WS(';',
    IF(SUBSTRING(s,1,1)='1','1',NULL),
    IF(SUBSTRING(s,2,1)='1','2',NULL),
    IF(SUBSTRING(s,3,1)='1','3',NULL),
    IF(SUBSTRING(s,4,1)='1','4',NULL),
    IF(SUBSTRING(s,5,1)='1','5',NULL),
    IF(SUBSTRING(s,6,1)='1','6',NULL),
    IF(SUBSTRING(s,7,1)='1','7',NULL)
  );
END$$
DELIMITER ;

-- 4) Cas A : colonne entière (bitmask) -> days_mask_list
-- Exemples de colonnes possibles : days_mask_int, days_mask_numeric, days_mask
-- ADAPTEZ le nom de la colonne si nécessaire.
UPDATE `your_table`
SET days_mask_list = bitmask_to_days_list(CAST(days_mask AS SIGNED))
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[0-9]+$'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 5) Cas B : colonne chaîne binaire '1010101' (7 chars) -> days_mask_list
-- Exemple colonne : days_mask_str, days_mask
UPDATE `your_table`
SET days_mask_list = binstr_to_days_list(days_mask)
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[01]{7}$'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 6) Cas C : colonne déjà sous forme '1;2;3' ou '1,2,3' ou tableau textuel -> nettoyage
-- Remplace virgules par points-virgules et supprime espaces superflus
UPDATE `your_table`
SET days_mask_list = TRIM(BOTH ';' FROM REPLACE(REPLACE(days_mask, ' ', ''), ',', ';'))
WHERE days_mask IS NOT NULL
  AND days_mask REGEXP '^[0-9 ,;]+$'
  AND days_mask REGEXP '[,;]'
  AND (days_mask_list IS NULL OR days_mask_list = '');

-- 7) Cas D : autres colonnes possibles (days, running_days_str, calendar_days)
-- Tenter des colonnes alternatives fréquemment utilisées si elles existent.
-- ADAPTEZ ces UPDATE en fonction du schéma réel.

-- Exemple: si vous avez une colonne `days` stockant '1,2,3'
UPDATE `your_table`
SET days_mask_list = TRIM(BOTH ';' FROM REPLACE(REPLACE(days, ' ', ''), ',', ';'))
WHERE days IS NOT NULL
  AND days_mask_list IS NULL;

-- Exemple: si vous avez une colonne `running_days_str` contenant '1111100'
UPDATE `your_table`
SET days_mask_list = binstr_to_days_list(running_days_str)
WHERE running_days_str IS NOT NULL
  AND running_days_str REGEXP '^[01]{7}$'
  AND days_mask_list IS NULL;

-- 8) Optionnel : normaliser les doublons / format
-- S'assurer que le résultat ne contient que numéros 1..7 séparés par ';'
-- (suppression d'entrées invalides)
UPDATE `your_table`
SET days_mask_list = (
  SELECT GROUP_CONCAT(d ORDER BY d SEPARATOR ';') FROM (
    SELECT DISTINCT CAST(x AS UNSIGNED) AS d
    FROM (
      SELECT TRIM(t) AS x FROM (
        SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(days_mask_list, ';', numbers.n), ';', -1) AS t
        FROM (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) numbers
        WHERE days_mask_list IS NOT NULL
      ) AS tokens
    ) AS vals
    WHERE d BETWEEN 1 AND 7
  ) AS cleaned
)
WHERE days_mask_list IS NOT NULL;

-- 9) Vérification manuelle (exemples de requêtes)
-- Remplacez your_table par le nom réel
SELECT id, days_mask, days_mask_list FROM `your_table` LIMIT 50;

-- 10) Si tout est OK, vous pouvez remplacer la colonne originale (optionnel)
-- Option A: sauvegarder l'ancienne colonne et renommer
-- ALTER TABLE your_table CHANGE COLUMN days_mask days_mask_old VARCHAR(255);
-- ALTER TABLE your_table CHANGE COLUMN days_mask_list days_mask VARCHAR(32);

-- Notes:
-- - Adaptez `your_table` et les noms de colonnes au schéma réel avant exécution.
-- - Faites un dump de la table avant d'exécuter ce script :
--   mysqldump -u user -p database your_table > your_table.backup.sql
-- - Le script est écrit pour MySQL 8+ (REGEXP). Si vous utilisez une autre version,
--   adaptez la syntaxe de création de fonctions et les expressions régulières.
