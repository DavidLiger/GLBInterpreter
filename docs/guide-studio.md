---
titre: Studio GLBI
surtitre: Studio de fabrication · GLBInterpreter
sous-titre: Guide d'utilisation : fabriquer un livre augmenté, du dossier du livre à l'essai sur téléphone
pastilles: Studio | GLBInterpreter 3fbc2f1 | 30/10/2026
pied: Studio GLBI · Guide d'utilisation · 3fbc2f1
parties:
  - Prendre en main | #2563eb | 1-3
  - Fabriquer un livre | #ea580c | 4-11
  - Annonces | #059669 | 12-12
  - Coulisses et dépannage | #dc2626 | 13-16
  - Aide-mémoire | #7c3aed | 17-17
---

# Guide d'utilisation — studio de fabrication (Studio GLBI)

Guide du studio à l'état du commit `3fbc2f1` de GLBInterpreter (30/10/2026). Il s'adresse à toi qui fabriques les livres, pas
au lecteur du livre. Il dit **quoi cliquer, dans quel ordre, et quoi vérifier**. Le pourquoi des règles est dans les
spécifications (`spec-app-bureau.md`, `spec-annonces.md`) et dans `architecture-glbinterpreter.md` ; tu n'en as pas besoin
pour travailler.

**Conventions.** Les textes du studio sont recopiés tels qu'ils s'affichent, entre guillemets français (ex. « Préparer le
livre »). Un bouton qui finit par « … » ouvre une feuille ou un explorateur avant d'agir. Ce qui est seulement prévu est
marqué **non disponible**.

**Les autres guides.** L'atelier (réglages des scènes et du mini-jeu) a son guide, `docs/guide-atelier.md` ; l'addon Blender
GLBGenerator a le sien, dans le dépôt `blender-addons`.

---

## 1. Ce que fait le studio

Le studio est une page locale qui orchestre la fabrication d'un livre sans taper de commande. Il ne remplace aucun outil :
il les lance et te dit lequel utiliser.

| Fichier du livre | Écrit par | Dans le studio |
|---|---|---|
| `book.json` (le livre : titre, scènes, carte, jeu) | **le studio** | « Modifier le livre… » |
| `blender/<scène>.blend` | Blender (le studio le crée une fois depuis le gabarit) | « Ouvrir dans Blender » |
| `scenes/<scène>.glb` (modèle exporté) | l'addon GLBGenerator, dans Blender | étape « Scènes » |
| `scenes/<scène>.edit.json` (réglages de la scène) | l'atelier | « Régler dans l'atelier » |
| `game/` (mini-jeu) | l'addon (GLB) et l'atelier (`game.edit.json`) | bloc « Mini-jeu » |

Le studio lance aussi les outils qui lisent le livre : l'**atelier**, le **lecteur du PC**, la **vérification**, la
**préparation** du livre pour le téléphone, le **serveur de test** (Android par le Wi-Fi) et la **publication d'essai**
(iPhone). Les **annonces des nouveaux livres** ont leur propre feuille, commune à tous les livres (§12).

## 2. Lancer et quitter le studio

### 2.1 Lancer

1. Double-clic sur `studio.cmd`, à la racine du repo GLBInterpreter. Une console s'ouvre, puis la page du studio
   (`http://127.0.0.1:4000/`) dans le navigateur.
2. Laisse la console ouverte (réduite) tant que tu travailles : c'est elle qui fait tourner le studio.

Pour le Bureau, crée un **raccourci** (clic droit sur `studio.cmd`, Envoyer vers, Bureau) : une copie du fichier hors du repo
ne trouve pas le repo et le dit. Icône du raccourci : Propriétés, « Changer d'icône… », `studio.ico` (à côté de
`studio.cmd`).

Le studio rouvre le dernier livre ouvert, sans lancer aucun outil.

### 2.2 Un seul onglet actif

Un seul onglet du studio travaille à la fois. Un nouvel onglet met les autres en veille : fenêtre « Studio ouvert dans un
autre onglet », bouton « Utiliser cet onglet ». Un second double-clic sur `studio.cmd` alors que le studio tourne ne lance pas
un deuxième studio : il rouvre la page, ou l'onglet ouvert annonce « Studio déjà lancé ».

Fermer l'onglet n'arrête rien. Si le studio ne répond plus, la page se reconnecte toute seule dès qu'il revient.

### 2.3 Quitter

« Tout arrêter et quitter » (barre du haut) arrête l'atelier, le lecteur du PC, le serveur de test et les tâches en cours,
puis le studio. **Blender reste ouvert** : le studio ne l'arrête jamais. Ctrl+C dans la console fait de même. La page affiche
alors « Studio arrêté ».

### 2.4 Alertes au démarrage

Des bandeaux apparaissent sous la barre du haut seulement quand ils ont lieu d'être :

- « Processus d'un studio arrêté brutalement » : un studio précédent a été tué sans s'arrêter proprement. « Arrêter les
  restes » les arrête ; « Les laisser tourner » les ignore.
- « Port … déjà occupé » : un outil ne pourra pas démarrer. « Qui l'occupe ? » montre le processus ; « Arrêter ce processus »
  s'il vient du repo, sinon à arrêter à la main.
- « Changement de livre : … arrêté(s). » : « Relancer sur ce livre » ou « Non merci ».
- `http-server absent de node_modules` : lancer la commande indiquée dans le bandeau.
- Chemin de lancement de casse différente (sous Windows) : le studio travaille quand même sur le chemin à sa casse réelle.

## 3. La page en un coup d'œil

### 3.1 Les zones

| Zone | Contenu |
|---|---|
| Barre du haut | titre et dossier du livre ouvert, « Changer de livre », « Tout arrêter et quitter » |
| Colonne de gauche | « Fabrication du livre » (les six étapes) ; puis « Journaux et processus », « Réglages », « Annonces », « Outils de développement » |
| Haut de droite | la **prochaine action** : une seule, avec son bouton plein |
| Bas de droite | le **détail** de l'étape affichée |

### 3.2 Les six étapes

1. **Livre** : un livre ouvert, `book.json` accepté, icône présente (§4, §5).
2. **Scènes** : chaque scène a son modèle exporté et ses réglages (§6).
3. **Vérifier** : la vérification du livre est passée sans erreur, après la dernière modification (§7).
4. **Essayer sur le PC** : le lecteur du PC a la dernière version (§8).
5. **Préparer le livre pour le téléphone** : le livre préparé est à jour (§9).
6. **Essayer sur téléphone** : serveur de test en marche (Android) ou essai publié (iPhone) (§10).

Chaque étape a un état : fait (coche), à faire, à refaire (le livre a changé depuis), erreur, en cours, ou en attente
(« après l'étape 1 »). Un clic sur une étape affiche son détail ; « voir l'étape » revient à celle de la prochaine action.
Quand tout est fait : « Tout est à jour ».

### 3.3 Règles communes

- **Une seule prochaine action** : c'est le seul bouton plein de la page (hors des feuilles). Suis-la.
- Un bouton grisé l'est pour une raison, écrite en dessous ou au survol : « Pas maintenant : … ».
- Les confirmations sont des alertes au centre : « Annuler » à gauche, l'action à droite (en rouge si elle arrête quelque
  chose).
- Les messages passagers apparaissent en haut de la page quelques secondes.
- Les feuilles (« Informations du livre », « Réglages »…) se ferment par « Fermer », Échap ou un clic à côté.

## 4. Ouvrir ou créer un livre (étape 1)

### 4.1 Ouvrir un livre

1. Prochaine action « Ouvrir ou créer un livre » : « Ouvrir un livre… ». Ou, dans le détail de l'étape Livre : champ
   « Dossier du livre », puis « Ouvrir », ou « Parcourir… ».
2. Dans l'explorateur « Ouvrir un livre », entre dans le dossier du livre (repéré « livre » : il contient `book.json`), puis
   « Choisir ce dossier » ; ou « Ouvrir » sur sa ligne.
3. Les « Livres récents » se rouvrent d'un clic (« × » retire un livre de la liste, pas du disque).

Un seul livre est ouvert à la fois. « Changer de livre » arrête l'atelier, le lecteur du PC et le serveur de test (après
confirmation), puis propose de les relancer sur le nouveau livre.

L'explorateur de la page sert à tous les choix de dossier ou de fichier du studio : lecteurs (`C:\`, `D:\`…), raccourcis,
champ de chemin, « Aller », « ↑ » (dossier parent).

### 4.2 Créer un livre

1. « Créer un livre… » ouvre la feuille « Créer un livre ». Un dossier sans `book.json` ouvert depuis la page l'ouvre aussi,
   préremplie (« Créer un livre ici »).
2. Remplis « Dossier parent » (« Parcourir… »), « Identifiant du livre (bookId) », « Nom du dossier » (le `bookId` par
   défaut), « Première scène », les titres en trois langues, « Adresse imprimée (origin) », « Année » et la mention légale.
3. « Créer le livre » : `book.json`, puis les dossiers `scenes/`, `blender/`, `images/`, `icons/`, `sounds/` ; le livre
   s'ouvre.

**Attention** : l'identifiant du livre ne change plus jamais (clé de la progression et du cache sur les téléphones). Pour un
autre identifiant, crée un autre livre.

### 4.3 L'icône du livre

Prochaine action « Ajouter l'icône du livre » : dépose une image carrée nommée `icon.png` (512 × 512 px au moins) dans le
dossier du livre. « Ouvrir le dossier du livre » l'ouvre dans l'Explorateur. L'étape se coche toute seule.

### 4.4 Le détail de l'étape Livre

Il résume `book.json` : « Titre », « Identifiant (bookId) », « Adresse imprimée », « Scènes », « Icône », « Image de
partage », « Mention légale », « Carte de collection », « Mini-jeu », « Dossier ». Boutons : « Ouvrir le dossier », « Copier
le chemin », « Modifier le livre… ».

## 5. Informations du livre (book.json)

« Modifier le livre… » ouvre la feuille « Informations du livre ». C'est le seul endroit où le studio écrit `book.json`, et
seulement par « Enregistrer book.json ».

### 5.1 Les champs

- « Identifiant du livre (bookId) » : en lecture seule pour un livre existant.
- « Langues » : lecture seule (français, anglais, espagnol, exigées par le contrat).
- « Titre en français », « en anglais », « en espagnol ».
- « Adresse imprimée (origin) » : l'adresse des QR imprimés (ex. `https://dino.editions-liger.com`).
- « Image de partage (ogImage) » : menu des images du dossier, « (aucune) » permis (avertissement à la vérification).
- « Année » et « Mention légale en français », « en anglais », « en espagnol ».
- Sections « Mini-jeu » (§11), « Carte de collection » ou « Types de cartes » (§5.3), « Scènes » (§5.2).

Le formulaire est validé en direct par le contrat : les messages s'affichent sous le formulaire, et « Enregistrer
book.json » reste grisé tant qu'il y en a. Sans modification, l'enregistrement répond « Rien à enregistrer : book.json est
déjà à jour ».

### 5.2 Scènes : ordre, ajout, retrait

- L'ordre des scènes est l'**ordre de déblocage** dans le livre : glisser une ligne, ou ↑ ↓.
- « Nouvelle scène », « Position », « Ajouter » : la scène entre dans la liste, écrite à l'enregistrement. Si un gabarit est
  réglé, il est copié en `blender/<scène>.blend` à l'enregistrement, jamais par-dessus un fichier existant.
- Retirer une scène laisse ses fichiers sur le disque (la vérification les signale comme non référencés).
- Renommer une scène est refusé : l'identifiant est écrit dans le modèle par l'addon, sert de clé de progression et figure
  dans les QR imprimés. Retirer puis ajouter crée une **autre** scène.

L'étape « Scènes » a aussi un champ « nouvelle scène, ex. trex » et « Ajouter » : la scène est ajoutée en fin de liste et
`book.json` est enregistré aussitôt. « Ordre, retrait… » ouvre la feuille.

### 5.3 Carte de collection et types de cartes

Avec un seul type de carte, la section s'appelle « Carte de collection » : les intitulés des caractéristiques, communs à
toutes les cartes (8 au plus, 14 caractères au plus par langue ; de 5 à 8, la carte prend une mise en page compacte).

- Par intitulé : « Identifiant » (proposé d'après le français, figé une fois enregistré), « Français », « Anglais »,
  « Espagnol », ↑ ↓, retrait.
- « Ajouter un intitulé ».
- « Ajouter un type » : le type actuel devient « Personnage » (identifiant `personnage`), et un second type est créé.

À partir de deux types, la section s'appelle « Types de cartes ». Le premier type est le « type par défaut » (carte sans type
choisi).

- Par type : « Identifiant du type », « Nom en français », « en anglais », « en espagnol » (14 caractères au plus), ses
  intitulés, ↑ ↓, « Retirer le type ».
- Retirer un intitulé ou un type utilisé par une carte : le studio nomme les scènes concernées et demande confirmation
  (« Retirer l'intitulé », « Retirer le type »).
- Changer le type de tête (ordre ou retrait) : confirmation qui nomme les cartes sans type choisi.

Le studio écrit la forme la plus courte : un seul type devient `cardFields` (son nom n'est pas gardé), deux types ou plus
`cardTypes`. Les valeurs des cartes se saisissent dans l'atelier (onglet Carte).

### 5.4 Modifications à la main

- `book.json` modifié hors du studio : bandeau « book.json modifié à la main » ; « Reprendre le fichier du disque » ;
  « Enregistrer » demande confirmation avant d'écraser.
- `book.json` illisible ou refusé : formulaire prérempli avec ce qui est lisible ; rien n'est écrit tant que l'ensemble n'est
  pas valide.
- `book.json` avec à la fois `cardFields` et `cardTypes` (écrit à la main) : bandeau, puis confirmation à l'enregistrement :
  les intitulés de `cardFields` sont perdus.

## 6. Scènes et Blender (étape 2)

### 6.1 Le tableau des scènes

Une ligne par scène, dans l'ordre du livre :

| Colonne | Fait quand | Fichier |
|---|---|---|
| « Scène Blender » | le `.blend` existe | `blender/<scène>.blend` |
| « Modèle exporté » | l'addon a exporté le modèle | `scenes/<scène>.glb` |
| « Réglages » | l'atelier a enregistré les réglages | `scenes/<scène>.edit.json` |
| « Vérification » | résultat de la dernière vérification pour cette scène | — |

Boutons par scène : « Créer depuis le gabarit » (pas de `.blend`), « Ouvrir dans Blender », « Régler dans l'atelier » (une
fois le modèle exporté). L'étape est faite quand chaque scène a son modèle exporté et ses réglages ; le `.blend` est montré
mais pas exigé.

### 6.2 Le chemin habituel d'une scène

1. « Créer depuis le gabarit » : le gabarit (`GLBI_ROOT`, empty de cible, lampe Sun, réglages d'export) est copié en
   `blender/<scène>.blend`. Sans gabarit réglé, le studio propose « Choisir le gabarit… ».
2. « Ouvrir dans Blender » (prochaine action « Ouvrir <scène> dans Blender ») : Blender s'ouvre sur ce fichier, à part ;
   jamais arrêté par le studio.
3. Dans Blender, finir la scène et l'exporter avec l'addon GLBGenerator : le modèle arrive tout seul dans le livre.
4. « Régler dans l'atelier » (prochaine action « Ouvrir <scène> dans l'atelier ») : nom, boutons, sons, cadrage, quiz,
   carte, crédits ; enregistrer dans l'atelier.

Blender pas encore réglé : la prochaine action « Indiquer où est Blender » propose « Détecter Blender » ou « Choisir
blender.exe… » (§14).

**Astuce** : l'atelier s'ouvre toujours dans le **même onglet**. Un nouveau clic sur une autre scène y change seulement de
scène (il demande confirmation si une saisie n'est pas enregistrée). Un atelier ouvert à la main est retrouvé lui aussi.

## 7. Vérifier le livre (étape 3)

« Vérifier le livre » lance la vérification (`book:check`) : modèles exportés, réglages des scènes, fichiers du livre, jeu.
Quelques secondes. Elle est « à refaire » dès qu'un fichier du livre change après elle.

Le détail range chaque ligne du rapport avec l'outil qui la corrige :

- « À corriger dans Blender » (ou « À regarder dans Blender » s'il n'y a que des avertissements) : bouton « Ouvrir dans
  Blender » par ligne ;
- « À corriger dans l'atelier » : « Ouvrir l'atelier », et « Ouvrir dans l'atelier » par ligne, sur la scène concernée
  (« Ouvrir le jeu dans l'atelier » pour une ligne du mini-jeu) ;
- « À corriger dans le studio ou le dossier du livre » : « Modifier le livre… » ou « Ouvrir le dossier ».

Chaque ligne dit en mots simples ce qui ne va pas ; le texte exact de la vérification est dans « Message d'origine ». Les
erreurs bloquent ; les « points à regarder » (avertissements) non. La prochaine action propose de corriger la première erreur
avec le bon outil (Blender d'abord, puis l'atelier, puis le studio).

Le dernier résultat de chaque livre est gardé : il revient à la réouverture du livre ou du studio. Une vérification arrêtée
garde le résultat précédent, marqué « vérification … interrompue », et l'étape passe « à refaire ».

## 8. Essayer sur le PC (étape 4)

« Essayer sur ce PC » ouvre le livre dans un onglet du navigateur, comme sur un téléphone, sans rien préparer. La première
fois, compter une minute : l'onglet affiche « Lecteur du livre : démarrage… » puis se charge tout seul.

Le détail montre deux tuiles : « Lecteur du livre » (« Ouvrir le lecteur », liens « menu du livre » et un par scène) et
« Atelier » (« Ouvrir l'atelier »). Chaque tuile a « Arrêter » et « Journal ».

Le lecteur du PC se met à jour au démarrage. S'il tourne déjà et que le livre a changé : « Mettre à jour le lecteur », puis
recharger l'onglet du lecteur.

## 9. Préparer le livre pour le téléphone (étape 5)

« Préparer le livre » fabrique le livre complet, celui qui s'installe sur un téléphone (dossier `out/` du repo) : une à
quelques minutes, à **refaire après chaque modification** du livre, avant un essai sur téléphone.

- La préparation arrête d'abord le serveur de test et le lecteur du PC s'ils tournent (confirmation « Préparer le livre »).
- Elle écrit aussi les QR du livre imprimé dans `dist/qr/<bookId>/`.
- Le détail donne l'« État », la « Dernière préparation » (mode, commit) et « Préparation » (en cours, durée).
- Échec : « Préparer le livre à nouveau » ; son journal dit pourquoi, et la vérification (étape 3) l'explique souvent.

L'état peut être : « prêt … », « à refaire : … modifié », « à faire : contient le livre de test » (après la suite complète),
« à faire : contient un autre livre », « à faire : préparé hors du studio », « pas encore préparé ».

## 10. Essayer sur téléphone (étape 6)

Trois tuiles, une fois le livre préparé.

### 10.1 Android, par le Wi-Fi

1. « Démarrer le serveur de test » : le PC sert le livre préparé sur le Wi-Fi.
2. « Adresse du PC sur le Wi-Fi » : choisis l'adresse du Wi-Fi si le PC en a plusieurs.
3. Filme le QR affiché (une scène, ou « menu du livre ») ; « ‹ » et « › » ou le menu passent d'un QR à l'autre.

« Première fois sur ce téléphone ? » rappelle la méthode : même Wi-Fi, réglage
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` de Chrome avec l'adresse affichée, « Clear site data » après un
essai raté, pare-feu de Windows.

**Attention** : si le livre a changé, le serveur sert la préparation d'avant. Arrête-le, « Préparer le livre », puis
redémarre-le.

### 10.2 iPhone, par un essai publié

1. Première fois : « Se connecter à Cloudflare » (une page de Cloudflare à accepter, une fois).
2. « Publier un essai » (confirmation « Publier un essai ? ») : le livre préparé part sur l'adresse d'essai
   (`https://glbi-essai.pages.dev` par défaut, réglable, §14). L'essai précédent est remplacé ; même adresse, donc installation
   et collection gardées sur les téléphones.
3. Filme un **QR d'essai** avec l'appareil photo de l'iPhone : la scène s'ouvre dans Safari. Partager → « Sur l'écran
   d'accueil », puis ouvre le livre depuis son icône. Dans l'app : menu → « Scanner un QR code » lit les mêmes QR.

Les QR d'essai (`dist/qr-essai/<bookId>/`) codent l'adresse d'essai ; le livre publié garde l'adresse imprimée : on essaie
exactement ce qui sera publié en vrai. Ils marchent aussi sur Android, sans réglage de Chrome. « Dernier essai » dit « à
jour » ou « à republier ». La publication est refusée si le livre préparé n'est pas à jour.

### 10.3 QR du livre imprimé

« QR du livre imprimé » affiche les QR écrits par « Préparer le livre » (`dist/qr/<bookId>/`), un par scène, plus « jeu
(mini-jeu) » si le livre a un jeu. Ils codent l'adresse imprimée : pour les essayer, ouvre le livre sur le téléphone, puis
menu du livre → « Scanner un QR code », et filme le QR affiché.

## 11. Mini-jeu dans le studio

Le mini-jeu de fin de collection est ouvert depuis le menu du livre (et par le QR du jeu) quand assez de cartes sont
gagnées. Il se fabrique en trois endroits :

| Quoi | Où |
|---|---|
| gabarit et seuil de déblocage | studio : « Informations du livre », section « Mini-jeu » |
| arène et personnages (modèles) | Blender, fichiers de `blender/jeu/`, addon en mode « Arène » et « Entité de jeu » |
| règles, caméra, textes, sons, crédits | atelier, entrée « Jeu (mini-jeu) » |

### 11.1 Section « Mini-jeu » de book.json

- « Gabarit du jeu » : « aucun jeu » ou « poursuite (capture au chrono) ». Sans gabarit, le livre n'a pas de jeu (le dossier
  `game/` n'est pas publié).
- « Cartes à gagner pour débloquer le jeu » : vide = il faut avoir manipulé toutes les scènes.

### 11.2 Bloc « Mini-jeu » de l'étape Scènes

Il liste les `.blend` de `blender/jeu/` (« Fichier Blender du jeu », « Modifié », « Ouvrir dans Blender ») et propose
« Régler le jeu dans l'atelier ». Aucun `.blend` : y enregistrer l'arène (`arena.blend`) et chaque personnage du jeu
(« Enregistrer sous » dans Blender). Des fichiers dans `blender/jeu/` sans gabarit choisi sont signalés.

Le QR du jeu imprimé (`jeu.svg`) est préparé avec les QR des scènes ; le QR d'essai du jeu est écrit à la publication d'essai
(§10).

**Non disponible** : gabarits `.blend` d'entité et d'arène créés par le studio.

## 12. Annonces des nouveaux livres

La feuille « Annonces » (colonne de gauche) prépare, signe et publie le **flux d'annonces commun à toutes les apps de
livres**. Elle ne dépend d'aucun livre ouvert et n'écrit rien dans `book.json`. La mention à côté de « Annonces » résume
l'état : « clés à générer », « publié … », ou « clés d'essai ».

Dans l'app d'un livre, le réglage des annonces est désactivé par défaut tant que l'avis du juriste n'est pas reçu ; une app
construite avec un `keys.ts` vide ne lit jamais le flux.

### 12.1 Clés et sauvegarde

1. « Générer les clés » (confirmation « Générer les clés ? ») crée deux clés : **k1 (courante)** et **k2 (secours)**, dans
   `%USERPROFILE%\.editions-liger\annonces-cles\` :
    - `k1-courante.pkcs8.pem` et `k2-secours.pkcs8.pem` : clés privées ;
    - `cles-publiques.json` : clés publiques.
2. Sauvegarde aussitôt ce dossier hors du PC (clé USB, coffre), la clé de secours à part si possible, puis « Sauvegarde
   faite ». Le bandeau de rappel reste tant que ce n'est pas fait.

« Ouvrir le dossier des clés » l'ouvre dans l'Explorateur. Le studio ne remplace **jamais** une clé : la génération est
refusée si un des fichiers existe, et tout dossier de clés situé dans le repo est refusé. Une clé privée ne sort jamais du
dossier (ni page, ni journal, ni `.studio/`, ni flux publié).

**Attention** : une clé perdue ne se recrée pas, et les apps publiées ne connaissent que ces deux clés.

### 12.2 keys.ts, avant la publication du livre 1

L'app d'un livre ne lit le flux que si les clés **publiques** sont compilées dans `src/annonces/keys.ts`. La ligne
« keys.ts » de la section « Clés de signature » dit : « vide », « à jour (mêmes clés que le dossier) », « différent des
clés du dossier » ou « forme non reconnue ».

1. « Écrire keys.ts » (confirmation) : le studio y écrit k1 puis k2. C'est le seul fichier source qu'il écrit.
2. Commite `src/annonces/keys.ts` (seul commit permis à contenir les clés publiques ; aucune clé privée nulle part).
3. Reconstruis puis republie les livres (« Préparer le livre », puis la publication).

Tout cela se fait **avant la publication du livre 1** : un livre publié avec un `keys.ts` vide ne lira jamais d'annonce
jusqu'à une republication.

### 12.3 Le brouillon

Le brouillon est enregistré tout seul, une demi-seconde après chaque saisie (`.studio/annonces/brouillon.json`).

- Section « Flux » : « Émission (issued) », « Expiration (expires) » (90 jours au plus après l'émission), « Clé de
  signature » (« k1 (courante) » ou « k2 (secours) »), et « Émis aujourd'hui, expire dans 90 jours ».
- Section « Annonces » : « Ajouter une annonce » (5 au plus). Par annonce :
    - « Identifiant » : une annonce n'est montrée qu'une fois par téléphone ; un identifiant changé = annonce montrée de
      nouveau ;
    - « Livre annoncé (bookId) », « Début », « Fin » (365 jours au plus après le début) ;
    - « Titre FR », « Titre EN », « Titre ES » (60 caractères) et « Texte FR », « Texte EN », « Texte ES » (200 caractères),
      adressés aux parents (vouvoiement) ;
    - « Lien « Voir le livre » (facultatif) » ;
    - « Choisir une image… » (WebP, PNG ou JPEG, 200 Ko au plus, copiée dans le brouillon), « Retirer l'image » ;
    - « Aperçu », ↑ ↓, « Retirer ».

Liens permis : en `https`, sur `editions-liger.com` et ses sous-domaines, ou sur `amazon.fr`, `amazon.com`, `amazon.es`,
`amazon.co.uk`.

« Aperçu de la fenêtre » (FR, EN, ES) reproduit approximativement la fenêtre « Pour les parents » du livre, sans le lecteur.

### 12.4 Contrôle et signature

Le contrôle tourne à chaque saisie :

- « Signature refusée pour l'instant » : liste des refus, chacun avec sa raison (dates, identifiants, longueurs, lien hors
  liste, image trop lourde ou de format non reconnu, plus de 5 annonces, flux de plus de 32 768 octets, émission dans le
  futur…) ;
- « Prêt à signer » : taille du flux signé ;
- avertissements, sans blocage : annonce terminée, annonce qui commence après l'expiration, annonce sans lien, flux sans
  annonce.

Le studio est **plus strict que l'app** : toute annonce hors règles refuse la signature du flux entier.

« Signer » signe le flux avec la clé choisie, le vérifie avec le vérificateur de l'app, puis écrit la sortie
(`.studio/annonces/sortie/`). La ligne « Signé » dit quand, avec quelle clé, combien d'annonces, et si la signature est « à
jour ».

### 12.5 Projet et publication

1. Section « Projet Cloudflare Pages des annonces » : nom du projet (créé à part, **jamais** celui des essais de livres),
   « Enregistrer ». Sans projet, la publication est refusée.
2. « Se connecter à Cloudflare » si besoin.
3. « Publier » (confirmation « Publier les annonces ? ») : le flux signé est envoyé, puis **relu** à l'adresse du projet et
   vérifié (signature, en-tête CORS, chaque image).

La ligne « Publié » donne le verdict : « publié et vérifié », ou « écart constaté » avec l'écart. « Journal » ouvre le journal
« Publication des annonces ». La publication est refusée sans flux signé, ou si le brouillon ou les clés ont changé depuis la
signature : signe à nouveau.

**Attention** : la relecture porte sur l'adresse `<projet>.pages.dev`. L'adresse lue par les apps
(`annonces.editions-liger.com`, domaine du projet de production) n'est pas relue : vérifie-la à la main à la première
publication de production.

Les apps ignorent un flux expiré : republie avant l'expiration.

### 12.6 Rotation des clés

**Non disponible** : la rotation des clés n'est pas automatisée dans le studio. La procédure complète est dans
`spec-annonces.md` §14.

Ce que le studio permet déjà :

- la clé de secours ne sert que si la clé courante est perdue ou compromise : choisir « k2 (secours) » dans « Clé de
  signature », puis « Signer » et « Publier » ; les apps publiées connaissent les deux clés ;
- de nouvelles clés ne remplacent jamais les anciennes : « Générer les clés » est refusé tant que les fichiers existent ;
- toute nouvelle clé publique impose « Écrire keys.ts » (confirmation renforcée si `keys.ts` est différent : les apps déjà
  publiées avec d'autres clés ne liraient plus le flux), le commit, puis la reconstruction et la republication des livres.

### 12.7 Clés d'essai

Pour un essai sans toucher aux vraies clés, lance le studio depuis Git Bash avec les variables `GLBI_ANNONCES_CLES` (dossier
de clés d'essai) et `GLBI_ANNONCES_KEYS_TS` (un `keys.ts` d'essai), pas par `studio.cmd`. Le bandeau « Clés d'ESSAI » le
rappelle. Avec des clés d'essai sans `keys.ts` d'essai, `keys.ts` n'est jamais écrit.

```bash
GLBI_ANNONCES_CLES=/c/essais/cles GLBI_ANNONCES_KEYS_TS=/c/essais/keys.ts npm run studio
```

## 13. Journaux et processus

« Journaux et processus » (colonne de gauche) ouvre la feuille du même nom :

- « Processus » : « Atelier », « Lecteur de développement », « Serveur de test » ; état, durée, PID, port, « Démarrer » ou
  « Arrêter », « Journal », liens ;
- « Sorties partagées » : « Livre préparé (out/) » et « Lecteur du PC (public/dev-book/) », chacune « à jour » ou « à
  refaire », avec le bouton qui la refait ;
- à droite, les journaux par onglet (un par processus et par tâche, plus celui du studio) ; « suivre la fin » colle la vue à
  la dernière ligne.

Les journaux sont aussi copiés dans `.studio/journaux/` (10 fichiers gardés par nom).

## 14. Réglages

La feuille « Réglages » prend effet tout de suite, sauf les ports (au prochain démarrage de chaque processus).

- **Blender** : « Programme blender.exe » (« Parcourir… », « Détecter » : cherche dans
  `C:\Program Files\Blender Foundation\Blender <version>\`) et « Gabarit de scène (.blend, facultatif) » ; « Enregistrer ».
  État : « trouvé », « introuvable » ou « non réglé ». Sans gabarit, rien n'est créé à l'ajout d'une scène.
- **Essai sur iPhone (Cloudflare Pages)** : « Projet Cloudflare Pages » (`glbi-essai` par défaut), « Enregistrer » ;
  adresse d'essai, état de la connexion, « Se connecter à Cloudflare ».
- **Ports** : « Atelier » (4100), « Lecteur de développement » (3000), « Serveur de test » (8001) ; « Enregistrer »,
  « Valeurs par défaut », « Revérifier les ports ». Le studio écoute sur le port 4000 ; les tests d'installation sur 4173.

## 15. Outils de développement et suite complète

La feuille « Outils de développement » ne sert qu'**après un patch du code** : le parcours n'en a pas besoin.

| Tâche | Ce qu'elle fait |
|---|---|
| `test:engine` | tests sans navigateur du lecteur |
| `test:schema` | tests sans navigateur du contrat (Zod, fusion) |
| « Suite complète » | livre de test, préparation en parties de 1 Mio, puis `test:install` |
| `book:check`, `dev:book`, `build` | « Commandes du parcours » : les mêmes que les étapes 3, 4 et 5 |

Chaque tâche a « Lancer » (ou « Arrêter ») et « Journal ».

**Attention** : la suite complète dure environ 20 minutes sous Windows (128 tests). Sa confirmation donne la durée de la
dernière suite mesurée par le studio. Elle arrête le serveur de test et le lecteur du PC ; ensuite, le livre préparé est le
livre de test : « Préparer le livre » est à refaire pour le vrai livre.

## 16. Messages fréquents

La vérification (§7) range et reformule chaque message ; voici les plus courants, avec la phrase affichée par le studio.

| Phrase du studio | Que faire |
|---|---|
| « L'icône du livre manque : déposer icon.png (image carrée de 512 px ou plus) dans le dossier du livre. » | déposer `icon.png` (§4.3) |
| « Le modèle exporté de la scène manque : ouvrir la scène dans Blender et l'exporter avec l'addon GLBGenerator. » | exporter depuis Blender (§6.2) |
| « Les réglages de la scène n'existent pas encore : ouvrir la scène dans l'atelier et les enregistrer. » | atelier, « Enregistrer » |
| « La scène n'a pas encore de nom : le donner dans l'atelier (en français, anglais et espagnol). » | atelier, onglet Scène |
| « Le bouton « … » n'a pas de texte : l'écrire dans l'atelier (en français, anglais et espagnol). » | atelier, onglet Actions |
| « Le son « … » n'a pas de crédit : l'ajouter dans l'atelier. » | atelier, onglet Crédits |
| « Le cadrage n'est pas réglé : le lecteur prendra un cadrage par défaut (onglet Caméra de l'atelier). » | avertissement : atelier, onglet Caméra |
| « La scène exportée et ses réglages ne correspondent plus : … » | retirer l'entrée dans l'atelier, ou la remettre dans Blender |
| « Le livre n'a pas d'image de partage … » | avertissement : « Modifier le livre… », image de partage |
| « Fichiers du dossier que le livre n'utilise pas (ils ne seront pas publiés) : … » | avertissement : ranger ou supprimer |

Messages du studio lui-même :

- « Pas maintenant : le livre a changé depuis sa préparation (…) : « Préparer le livre » d'abord » : étape 5 d'abord ;
- « … en cours : attendre sa fin » : une seule tâche à la fois parmi celles qui écrivent le livre préparé ;
- « Le navigateur a bloqué l'ouverture d'un onglet » : autoriser les fenêtres surgissantes pour le studio ;
- « Démarrage interrompu » dans l'onglet d'attente : voir le journal (« Journaux et processus »).

Un message sans phrase simple garde « Point signalé par la vérification, sans explication simple pour l'instant » : lis le
« Message d'origine ».

## 17. Aide-mémoire

- [ ] Livre ouvert, `book.json` enregistré, `icon.png` présent (étape 1 cochée).
- [ ] Chaque scène : `.blend` dans `blender/`, modèle exporté par l'addon, réglages enregistrés dans l'atelier.
- [ ] « Vérifier le livre » : aucune erreur ; les points à regarder lus.
- [ ] « Essayer sur ce PC » : chaque scène ouverte, boutons et sons essayés.
- [ ] « Préparer le livre » après la dernière modification.
- [ ] Essai Android (serveur de test) et iPhone (« Publier un essai ») ; QR imprimés lus par « Scanner un QR code ».
- [ ] Avant la publication du livre 1 : clés des annonces générées et sauvegardées, `keys.ts` écrit et commité, livres
      reconstruits.
