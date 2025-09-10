-- Script pour ajouter la colonne isSubstitution à la table sillons
USE `horaires`;

-- Ajouter la colonne isSubstitution à la table sillons
ALTER TABLE `sillons`
ADD COLUMN `is_substitution` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Indique si ce sillon peut être utilisé comme substitution pendant les travaux' AFTER `stops_signature`;

-- Mettre à jour la vue de compatibilité pour inclure la nouvelle colonne
CREATE OR REPLACE VIEW `schedules` AS SELECT * FROM `sillons`;
