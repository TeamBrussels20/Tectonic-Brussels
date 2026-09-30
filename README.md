# Kompass by KBC

> Un guide financier qui comprend la situation de chaque client et l'aide à avancer, au bon moment.

Kompass est un proof of concept développé pour le challenge KBC. Le client pose sa question avec ses mots (« je veux faire un prêt hypothécaire », « je veux économiser chaque mois, aide-moi ») et Kompass répond à partir de ses vraies données bancaires : un cap, des chiffres concrets, un itinéraire d'actions, et un passage de relais vers un conseiller quand la décision le demande.

Kompass ne remplace pas le conseiller. Il prépare le terrain pour que chaque rendez-vous commence au bon endroit.

---

## Lancer le projet en local

Prérequis : [Node.js](https://nodejs.org) 18 ou plus récent.

```bash
git clone https://github.com/<ton-compte>/kompass.git
cd kompass
npm install
npm run dev
```

Ouvre ensuite **http://localhost:5173**.

### Mode démo ou mode IA

Sans configuration, Kompass tourne en **mode démo** : un moteur de règles local détecte l'intention de la question et construit la réponse à partir des données du client. Tout fonctionne hors ligne, idéal pour une démo en jury.

Pour activer les réponses générées par Claude :

```bash
cp .env.example .env
# puis colle ta clé dans .env : ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Le badge en haut à droite passe de « Mode démo » à « IA active ». Si l'appel à l'API échoue, le serveur bascule automatiquement sur le mode démo, pour que la démo ne plante jamais.

### Clients de démonstration

| Client | Moment de vie | À essayer |
|---|---|---|
| Lotte Peeters, 29 ans, Gand | Prépare un premier achat | « Je veux faire un prêt hypothécaire » |
| Karim El Amrani, 38 ans, Liège | Budget familial sous tension (3e enfant) | « Mes fins de mois sont difficiles » |
| Marc Dubois, 61 ans, Namur | Approche de la pension | « Que faire de mon épargne ? » |

Toutes les données sont fictives.

### Ajouter des documents

Clique sur le trombone à gauche de la zone de saisie, ou glisse un fichier dans la conversation. Formats acceptés : PDF, PNG, JPG, WEBP et TXT, 10 Mo maximum.

Kompass reconnaît le type de document (fiche de paie, bail, contrat de crédit, contrat de travail, assurance, avertissement-extrait de rôle), en extrait les données clés et les compare aux comptes du client. Par exemple, il vérifie que le net de la fiche de paie correspond aux revenus reçus, ou calcule le préavis d'un bail. Chaque document devient un signal que le client peut désactiver, et alimente la checklist du dossier hypothécaire.

Le dossier `samples/` contient trois documents fictifs pour la démo :
- `fiche-de-paie-lotte-peeters-2026-09.pdf` et `contrat-de-bail-lotte-peeters.pdf` pour Lotte ;
- `contrat-pret-auto-el-amrani.pdf` pour Karim.

| | Mode démo | Mode IA (clé API) |
|---|---|---|
| PDF avec texte | Lu, champs extraits par règles | Lu par Claude |
| PDF scanné ou photo | Non lu (pas d'OCR) | Lu par Claude |
| Types reconnus | Paie, bail, crédit (champs détaillés) | Tous, avec observations personnalisées |

Les documents restent en mémoire dans le serveur local et disparaissent à son redémarrage. En mode IA, ils sont envoyés à l'API Anthropic pour analyse : pour une démo, utilise les documents fictifs de `samples/` plutôt que tes vrais documents.

---

## La vision

La plupart des banques personnalisent en poussant des produits à des segments. Kompass inverse la logique : **on part de ce que le client essaie d'accomplir**, et la banque devient le moyen d'y arriver.

### 1. Des signaux pour comprendre les besoins
Les transactions disent déjà presque tout : un loyer qui augmente, des frais de crèche qui apparaissent, une épargne qui dort, un simulateur ouvert trois fois. Kompass les transforme en signaux lisibles (`server/signals.js`).

### 2. Reconnaître le client par sa situation, son comportement et son intention
Chaque signal appartient à une de trois familles, affichées telles quelles au client :
- **Situation** : ce qui est vrai aujourd'hui (revenus, réserve, épargne)
- **Comportement** : ce qui change (tendances sur 6 mois, fins de mois négatives)
- **Intention** : ce que le client prépare (recherches dans l'app, événements de vie)

Ces signaux se combinent en un **moment de vie** compréhensible (« Prépare un premier achat »), jamais en score opaque.

### 3. Une expérience qui s'adapte seule
Le même écran devient une aide à l'achat pour Lotte, un plan de respiration budgétaire pour Karim et une préparation de pension pour Marc. Kompass prend aussi l'initiative **une seule fois, au bon moment** : un message proactif ancré dans un fait réel (« votre loyer a augmenté de 7 % cet été »).

### 4. Sans couture entre produits, services et canaux
Chaque réponse peut se terminer par un passage vers un conseiller. Le conseiller reçoit le résumé de la conversation : le client n'a rien à réexpliquer. Le même moteur peut alimenter l'app, le site, le chatbot existant et l'écran du conseiller en agence.

### 5. Un impact pour 2,3 millions de clients à la fois
- Les signaux sont calculés par du code déterministe, bon marché et auditable, en batch la nuit pour tous les clients.
- Le modèle de langage n'intervient que pour formuler la réponse quand le client pose une question.
- Le client contrôle chaque signal (interrupteur dans le panneau de gauche). La confiance est une condition de l'échelle, pas une contrainte.

---

## Architecture

```
kompass/
├── server/
│   ├── index.js          API Express (profil, chat, rendez-vous)
│   ├── signals.js        Moteur de signaux, moment de vie, message proactif
│   ├── prompt.js         Prompt système envoyé à Claude (signaux autorisés uniquement)
│   ├── mockAdvisor.js    Moteur de démo sans IA, même format de réponse que Claude
│   ├── documents.js      Upload, lecture PDF, classification, extraction, analyse par Claude
│   └── data/customers.js Clients fictifs (6 mois d'historique)
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── ContextPanel.jsx   « Ce que Kompass comprend » + consentement
│   │   ├── Chat.jsx           Accueil, message proactif, conversation
│   │   ├── Answer.jsx         Cap, chiffres, simulation, itinéraire, rendez-vous
│   │   └── CompassMark.jsx
│   └── styles.css
├── samples/              Documents fictifs pour la démo
└── vite.config.js
```

**Flux d'une question**

```
Question du client
      │
      ▼
Profil + signaux (déterministe) ──► filtrés par le consentement du client
      │
      ▼
Claude (ou moteur de démo) ──► réponse JSON structurée
      │
      ▼
Interface : cap · chiffres · simulation · itinéraire · produits · conseiller
```

La réponse est toujours un objet JSON (`heading`, `reply`, `insights`, `simulation`, `notes`, `checklist`, `steps`, `products`, `handoff`, `followups`), ce qui permet d'afficher des composants riches plutôt qu'un simple texte.

### Passer à l'échelle (au-delà du PoC)
- Remplacer `data/customers.js` par un flux depuis le data lake KBC (transactions catégorisées).
- Calculer les signaux en batch et les stocker dans un feature store.
- Brancher `/api/handoff` sur le CRM des conseillers.
- Stocker les documents dans le coffre-fort numérique KBC (chiffré), avec durée de conservation et suppression à la demande.
- Ajouter l'évaluation : qualité des réponses, taux de passage vers un conseiller, satisfaction.
- Conformité : journalisation des réponses, garde-fous MiFID pour tout ce qui touche au placement.

---

## Mettre le projet sur GitHub

```bash
git init
git add .
git commit -m "Kompass by KBC : proof of concept"
git branch -M main
git remote add origin https://github.com/<ton-compte>/kompass.git
git push -u origin main
```

Crée d'abord un dépôt vide nommé `kompass` sur github.com (sans README). Le fichier `.env` est ignoré par `.gitignore` : ta clé API ne sera jamais publiée.

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l'API (port 3001) et l'interface (port 5173) |
| `npm run build` | Construit l'interface dans `dist/` |
| `npm start` | Sert l'API et l'interface construite sur http://localhost:3001 |

---

Kompass donne des repères, pas un conseil financier. Projet étudiant, non affilié officiellement à KBC.
