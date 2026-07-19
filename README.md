# rdv-ressource-aime

Application de réservation en ligne du cabinet Ressource A.I.M.E (Olivier-Marie et Karla Lucenay), en production sur **rdv.ressource-aime.fr**.

## Vue d'ensemble

L'application gère la prise de rendez-vous pour deux praticiens distincts, chacun avec ses propres prestations, ses propres créneaux et son propre branding dans les emails :

- **Cabinet (Olivier-Marie)** : appel découverte gratuit, séance individuelle, séance couple, forfaits.
- **Karla** (`/karla`) : séance enfant, séance adulte.

La disponibilité des créneaux est calculée en direct depuis Google Calendar (pas de calendrier interne à l'application). La réservation, le paiement, l'envoi des emails et la création de l'événement Google Calendar sont entièrement automatisés.

## Stack technique

| Composant | Choix |
|---|---|
| Serveur | Node.js 22, Express |
| Vues | EJS |
| Base de données | MySQL (table unique `reservations`) |
| Paiement | Stripe (clé live en production) + lien SumUp fixe pour les séances visio |
| Calendrier | Google Calendar API (OAuth2) |
| Emails | Nodemailer (SMTP), 2 identités d'envoi distinctes (cabinet / Karla) |
| Hébergement | o2switch, process géré par **PM2** (pas Passenger, pas le sélecteur Node.js cPanel) |
| Dépôt | GitHub `Omlucenay/rdv-ressource-aime` |

## Structure du code

```
app.js                  Point d'entrée, montage des routers
routes/
  index.js              Page d'accueil cabinet + liste des prestations (PRESTATIONS)
  karla.js               Page /karla + liste des prestations Karla (KARLA_PRESTATIONS)
  auth.js                OAuth2 Google (connexion + refresh automatique du token)
  calendar.js            Calcul des créneaux disponibles (/calendar/slots, /calendar/available-days)
  booking.js             Création de réservation, paiement, confirmation, annulation
  webhook.js             Webhook Stripe (checkout.session.completed)
db/
  connection.js          Pool MySQL
  mailer.js              Templates et envoi des emails de confirmation
  schema.sql             Schéma de la table reservations
views/                   Templates EJS (accueil, gestion, annulation, succès)
```

## Flux de réservation

1. Le client choisit une prestation sur `/` (ou `/karla`) et une date.
2. Le front interroge `/calendar/available-days` puis `/calendar/slots` pour n'afficher que les créneaux réellement libres.
3. À la validation, `POST /booking/create` :
   - enregistre la réservation en base (statut `pending`) ;
   - si la prestation est payante par Stripe → redirection vers Stripe Checkout ;
   - si forfait → redirection vers la page de paiement externe dédiée ;
   - sinon (découverte gratuite, séance à régler sur place) → confirmation immédiate.
4. **Confirmation** (`confirmerReservation`, déclenchée directement ou par le webhook Stripe après paiement) :
   - crée l'événement dans le bon calendrier Google (avec lien Google Meet si visio) ;
   - envoie l'email de confirmation, brandé cabinet ou Karla selon la prestation ;
   - notifie l'administrateur concerné par email.
5. Le client peut gérer ou annuler son rendez-vous via un lien unique (`/booking/gerer/:id`), qui reste brandé selon le praticien.

## Disponibilité des créneaux

`routes/calendar.js` calcule les créneaux libres en croisant plusieurs calendriers Google selon le type de prestation, pour éviter tout double-booking entre les deux praticiens et avec l'agenda personnel :

| Type de prestation | Calendriers vérifiés |
|---|---|
| Individuel / couple / forfaits | Cabinet + Karla + **Perso (MOOR)** |
| Appel découverte | Cabinet + Appel découverte + **Perso (MOOR)** |
| Séance enfant / adulte (Karla) | Calendrier Karla (créneaux marqués `DISPO`) + Cabinet |

Le calendrier **MOOR** (agenda personnel d'Olivier, id dans `GOOGLE_CALENDAR_PERSO`) bloque les créneaux cabinet dès qu'un événement y est posé (voyage, indisponibilité perso, etc.). La lecture de ce calendrier est protégée (`getEventsPerso`) : si l'accès échoue pour une raison quelconque, l'application continue de fonctionner normalement, simplement sans tenir compte de MOOR ce jour-là — un souci sur ce calendrier annexe ne doit jamais rendre la réservation indisponible.

## Authentification Google Calendar

Un unique compte Google (`ressource.aime@gmail.com`) gère l'accès à tous les calendriers via OAuth2 (`/auth/google` pour (re)connecter). Le token est stocké en base (`google_tokens`) et rafraîchi automatiquement avant expiration.

**Point de vigilance historique** : tant que l'écran de consentement OAuth du projet Google Cloud est en statut *Testing*, le refresh token expire tous les 7 jours quel que soit ce rafraîchissement automatique, ce qui coupait périodiquement la réservation (`auth:false`). Le projet a été passé en statut **Production** le 19/07/2026 pour éliminer cette récidive.

Un workflow n8n (**"Cabinet - Monitoring Auth Google rdv-aime"**, actif) vérifie toutes les 3h que l'authentification Google est toujours valide et alerte par Telegram avec le lien de reconnexion si ce n'est plus le cas.

## Déploiement

```bash
# En local : éditer, committer, pousser sur GitHub
git push origin main

# Sur le serveur (o2switch, accès SSH par IP dynamique à whitelister au besoin
# dans cPanel → Sécurité → Autorisation SSH)
ssh -i ~/.ssh/o2switch_rdv_aime aire2407@aire2407.odns.fr
cd /home/aire2407/rdv-aime
git pull origin main
source ~/nodevenv/rdv-aime/22/bin/activate
pm2 restart rdv-aime               # changement de code seul
pm2 restart ecosystem.config.js --update-env   # si une variable .env a changé
```

Vérification après déploiement : `curl https://rdv.ressource-aime.fr/` (200) puis un endpoint qui dépend du changement, jamais se fier au seul code 200 (un ancien process mort peut encore répondre pendant quelques secondes).

## Historique des versions

### 10/05/2026 — Import initial
Dépôt créé, code réel de l'application rapatrié depuis l'export cPanel du serveur o2switch (aucune trace Git avant cette date).

### 06/07/2026 — Premier diagnostic en profondeur
- Correction du calendrier cabinet : le mardi n'avait aucune règle d'horaire côté serveur alors qu'il ne doit pas être proposé du tout.
- SSH réglé durablement (clé dédiée, IP whitelistée).

### 10/07/2026 — Corrections de l'appel découverte et de la fiabilité
- Appel découverte : tarif et durée corrigés (gratuit, 15 min, était affiché "1h" et "à régler"), passage en mode téléphone (au lieu de visio), lundi ajouté aux créneaux disponibles (absent par erreur).
- Numéro de téléphone du cabinet masqué pour l'appel découverte.
- Titre d'événement Google Calendar reformaté pour rester compatible avec le parser n8n qui alimente le CRM Notion.
- Décalage d'un jour dans les emails de confirmation corrigé (bug de fuseau horaire côté lecture MySQL).
- Page dédiée à l'appel découverte, gestion de la reprise de rendez-vous avec annulation automatique de l'ancien créneau, URLs d'annulation/gestion en français.

### 11/07/2026 — Intégration complète du segment Karla + fiabilisation
- Paiement : lien SumUp intégré (email + description d'événement) pour les séances individuelles en visio.
- Segment Karla ajouté : page `/karla`, prestations séance enfant / adulte, calendrier dédié, branding complet des emails (identité, couleur, signature, boîte d'envoi propre), notification admin routée vers la bonne adresse.
- Rafraîchissement automatique du token OAuth Google avant expiration.
- Plusieurs bugs de cohérence corrigés entre les deux praticiens (créneaux adulte Karla qui retombaient sur ceux du cabinet, titre d'invitation Calendar, liens de retour/annulation).

### 19/07/2026 — Fiabilité de l'authentification et croisement avec l'agenda personnel
- Diagnostic et résolution d'une panne de connexion Google Calendar récurrente (`auth:false`, plus aucun créneau ne s'affichait) : cause racine identifiée (statut *Testing* du projet OAuth Google Cloud, refresh token limité à 7 jours), corrigée en passant le projet en *Production*.
- Mise en place d'un monitoring automatique (n8n, toutes les 3h) qui alerte par Telegram en cas de nouvelle déconnexion.
- Ajout du croisement avec l'agenda personnel MOOR : un événement posé par Olivier sur son agenda perso (voyage, indisponibilité) bloque désormais automatiquement les créneaux de réservation cabinet, de façon défensive (aucun impact sur la réservation si ce calendrier annexe devient inaccessible).
