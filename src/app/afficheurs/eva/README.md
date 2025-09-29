Afficheur EVA — Arrivées

Emplacement : /src/app/afficheurs/eva/arrivees

But
- Afficheur "EVA" pour les arrivées, calqué visuellement sur l'image fournie.
- Utilise le même système de query `?gare=` que les afficheurs existants.

Fichiers créés
- page.jsx : composant React côté client, récupère les données depuis l'API classique des arrivées.
- page.css : styles spécifiques pour reproduire le design EVA.

API
- Cet afficheur appelle l'API interne existante :
  /api/afficheurs/classiques/arrivees?gare=NomDeLaGare

Usage
- Démarrer le serveur de développement :

  npm run dev

- Ouvrir l'afficheur dans le navigateur :

  http://localhost:3000/afficheurs/eva/arrivees?gare=Lyon Part-Dieu

Notes
- Le composant s'appuie sur les mêmes conventions de données que les afficheurs classiques (champs : arrivals[], stops[], arrival_time, voie, logo, type, number, status, delay, cancelled...).
- Si vous voulez un comportement spécifique (par ex. données EVA différentes), il faudra ajouter une route API dédiée et adapter la source des données.

