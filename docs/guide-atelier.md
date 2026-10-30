---
titre: Atelier
surtitre: Atelier de configuration · GLBInterpreter
sous-titre: Guide d'utilisation : régler les scènes et le mini-jeu d'un livre augmenté dans le vrai lecteur
pastilles: Atelier | GLBInterpreter 3fbc2f1 | 30/10/2026
pied: Atelier · Guide d'utilisation · 3fbc2f1
parties:
  - Prendre en main | #2563eb | 1-3
  - Régler une scène | #ea580c | 4-10
  - Contrôler | #dc2626 | 11-12
  - Mini-jeu | #059669 | 13-13
  - Enregistrer et limites | #7c3aed | 14-15
---

# Guide d'utilisation — atelier de configuration

Guide de l'atelier à l'état du commit `3fbc2f1` de GLBInterpreter (30/10/2026). Il s'adresse à toi qui fabriques les livres,
pas au lecteur du livre. Il dit **quoi régler, dans quel onglet, et quoi vérifier**. Le pourquoi des règles est dans
`spec-atelier-glbi.md` et dans `architecture-glbinterpreter.md` ; tu n'en as pas besoin pour travailler.

**Conventions.** Les textes de l'atelier sont recopiés tels qu'ils s'affichent, entre guillemets français (ex.
« Enregistrer »). « FR, EN, ES » désigne les trois champs d'un texte traduit (français, anglais, espagnol). Ce qui est
seulement prévu est marqué **non disponible**.

**Les autres guides.** Le studio (ouvrir un livre, `book.json`, vérification, essais sur téléphone, annonces) a son guide,
`docs/guide-studio.md` ; l'addon Blender GLBGenerator a le sien, dans le dépôt `blender-addons`.

---

## 1. Ce que fait l'atelier

Une scène d'un livre a deux couches de réglages :

| Couche | Fichier | Écrite par | Exemples |
|---|---|---|---|
| couche 3D | `scenes/<scène>.glb` | l'addon GLBGenerator, dans Blender | actions et leur ordre, clips, boucle, coupe au noir, cible et position de la caméra, marqueurs (événements) |
| couche éditoriale | `scenes/<scène>.edit.json` | **l'atelier** | nom de la scène, libellés, icônes, sons, cadrage, quiz, carte, crédits |

L'atelier montre la scène dans le **vrai lecteur** du livre, avec tes réglages, et écrit la couche éditoriale. Il ne touche
jamais au GLB ni à `book.json` (écrit par le studio). La vérification du livre fusionne les deux couches ; le Rapport de
l'atelier montre les mêmes messages, en direct.

Pour le mini-jeu, c'est pareil : les GLB de `game/` viennent de l'addon, `game/game.edit.json` vient de l'atelier (§13).

## 2. Ouvrir l'atelier

### 2.1 Depuis le studio

Le studio démarre l'atelier sur le livre ouvert et l'ouvre dans le navigateur :

- étape « Scènes » : « Régler dans l'atelier » (sur une scène) ou « Régler le jeu dans l'atelier » ;
- prochaine action « Ouvrir <scène> dans l'atelier » ;
- étape « Vérifier » : « Ouvrir dans l'atelier » sur une ligne, « Ouvrir le jeu dans l'atelier », ou « Ouvrir l'atelier » ;
- étape « Essayer sur le PC » : tuile « Atelier », « Ouvrir l'atelier ».

L'atelier s'ouvre toujours dans le **même onglet**. Un nouveau clic dans le studio y change seulement de scène, sans
recharger ; si ta saisie n'est pas enregistrée, l'atelier demande d'abord « Modifications non enregistrées sur « … » : les
abandonner pour ouvrir « … » ? ». Un atelier ouvert à la main est retrouvé lui aussi.

### 2.2 Sans le studio

```bash
npm run atelier -- --source books/dinosaures
```

L'atelier écoute sur `http://127.0.0.1:4100/atelier/` (`--port` pour un autre port, `--no-open` pour ne pas ouvrir le
navigateur). L'adresse `…/atelier/#/s/<scène>` ouvre une scène, `…/atelier/#/jeu` le mini-jeu.

### 2.3 Le lecteur de l'atelier

Au centre, le lecteur affiche d'abord « Cliquer pour commencer » : clique, puis la souris tourne la vue et les boutons
d'animation jouent leur clip et leur son. Le son d'ambiance joue en fond ; le bouton volume du lecteur le coupe.

## 3. La page en un coup d'œil

### 3.1 La barre du haut

- « Atelier — <titre du livre> » et le dossier du livre.
- « Scène » : menu des scènes dans l'ordre de `book.json`, puis « Jeu (mini-jeu) » si le livre a un jeu. Les GLB de
  `scenes/` absents de `book.json` sont listés sous « Hors book.json (diagnostic seul) ».
- « Aperçu » FR, EN, ES : langue des boutons du lecteur et des aperçus (quiz, carte, jeu). Elle ne change rien au fichier.
- Pastille « n erreur(s), n avertissement(s) » : un clic ouvre le Rapport.
- État : « enregistré », « ● modifié, non enregistré » ou « edit.json absent ».
- « Enregistrer » (ou Ctrl+S) : seule écriture de l'atelier, jamais automatique (§14).
- Point vert : surveillance active ; rouge : serveur déconnecté.

### 3.2 Les onglets d'une scène

Neuf onglets à droite : « Scène », « Caméra », « Actions », « Ambiance », « Quiz », « Carte », « Crédits », « Rapport »,
« Diagnostic ». En bas, « Dernière modification : … » nomme les fichiers changés (« (enregistré par l'atelier) » quand c'est
lui).

### 3.3 Les menus de fichiers

Images et sons se choisissent dans des menus qui listent les fichiers du dossier du livre ; il n'y a pas d'import dans
l'atelier. Dépose les fichiers dans `images/`, `icons/` ou `sounds/` : les menus se mettent à jour tout seuls.

- « (aucune) » ou « (aucun) » vide le champ.
- Un nom refusé (espace, accent…) est grisé : « (nom refusé : lettres, chiffres, _, - et . seulement) ».
- Un fichier cité mais disparu : « (absent du dossier) ».
- Un son s'écoute par « ▶ Écouter » (« ■ Arrêter ») ; une image montre sa vignette.

### 3.4 Textes traduits

Un texte traduit a trois champs, FR, EN, ES. Il n'est enregistré que **complet**, dans les trois langues : sinon il est
marqué « incomplet, non enregistré ». Un texte limité affiche son compteur (ex. `118/250`) et « trop long, non enregistré »
au-delà.

## 4. Onglet Scène

- « Nom de la scène » (FR, EN, ES, obligatoire) : affiché sur l'écran de chargement et en titre de la carte de collection.
- « Image de chargement » : menu des images du dossier. « Voir l'écran de chargement » relance l'écran de chargement du
  lecteur.

Si le livre a des cartes, un nom trop long pour le titre de la carte est signalé : « Nom trop long pour le titre de la carte
de collection en … : il y sera coupé (« … ») ».

## 5. Onglet Caméra

Le cadrage règle la caméra du lecteur autour de la **cible** (empty choisi dans l'addon, affiché en tête de l'onglet,
« Couche 3D : se règle dans Blender (addon), non éditable ici. »). Sans cible dans le GLB, le cadrage ne peut pas être
réglé ici.

### 5.1 Les champs

| Champ | Unité | Vide |
|---|---|---|
| « distance minimale », « distance maximale » | mètres | 1,5 r à 6 r (r = rayon de la scène) |
| « zoom de départ » | 0 = distance minimale, 1 = maximale | 0,5 |
| « angle polaire minimal », « angle polaire maximal » | degrés ; 0° = caméra au-dessus, 90° = à l'horizontale | 0° à 90°, départ à 70° |
| « azimut minimal », « azimut maximal » | degrés ; 0° = de face, 90° = profil | sans borne |
| « axe de vue » | « x : profil », « y : face », « z : face » | « (défaut : face) » |
| « zoom à la molette ou au pincement » | case | coché |

Un champ vide affiche en grisé la valeur par défaut du lecteur. Les angles sont saisis en degrés et enregistrés en radians.
L'axe de vue ne compte que si les deux bornes d'azimut ne sont pas déclarées.

### 5.2 Régler en regardant

1. Tourne et zoome dans le lecteur jusqu'à la vue voulue.
2. « ◎ vue » à côté d'un champ y recopie la valeur actuelle (distance, angle ; pour le zoom : (distance − min) / (max − min)).
3. « Vue actuelle du lecteur » et « Vue de départ de la saisie » affichent les deux vues.
4. « Aller à la vue de départ » place la caméra comme au lancement de la scène.

Le cadrage saisi est appliqué au lecteur tout de suite, sans recharger la scène. « Appliquer les bornes » décoché libère la
vue pour viser au-delà des bornes saisies (réglage de la page, non enregistré). « Revenir au cadrage enregistré » reprend
`edit.json` ; « Vider le cadrage » vide tous les champs.

**Attention** : une paire min > max n'enregistre **aucune** de ses deux bornes (signalé dans le Rapport). Seuls les champs
valides sont enregistrés.

### 5.3 Caméra tenue par une action

Pendant une action dont la caméra est posée sur un empty (réglé dans l'addon), l'onglet affiche « Caméra tenue par
l'action « … » » : « ◎ vue » et « Aller à la vue de départ » sont désactivés jusqu'au retour de la caméra. Une valeur
saisie au clavier est gardée et posée sur le lecteur au retour.

## 6. Onglet Actions (boutons et événements)

Une section par action du GLB, dans l'ordre des boutons : « 1. <action> », clip, « en boucle » ou « une fois » (GLB, lecture
seule).

### 6.1 Ce qui vient de Blender (lecture seule)

- « Transition : fondu » ou « Transition : coupe au noir (entrée et sortie) ».
- « Caméra : libre (suit la cible) » ou « Caméra : posée sur l'empty <nom> pendant l'action ».

« GLB, lecture seule : se règle dans Blender (addon) ».

### 6.2 Ce qui se règle ici

- « Libellé du bouton » (FR, EN, ES, obligatoire).
- « Icône » : menu des images.
- « Son » : menu des sons, « ▶ Écouter ». Il joue au clic du bouton et s'arrête à la fin du clip.

Essaie dans le lecteur : un clic sur le bouton joue le clip et le son, même non enregistré.

### 6.3 Événements (sons à un instant précis)

« Événements (marqueurs de Blender, dans l'ordre du GLB ; instant en lecture seule) » : un par marqueur posé dans Blender,
avec son identifiant et son instant (ex. « à 2,000 s »). Choisis un son pour chacun ; il joue à cet instant du clip, en plus
du son de l'action. Sans son : « sans son (ignoré) » (avertissement à la vérification).

### 6.4 Orphelins

Un marqueur ou une action renommé ou retiré dans Blender laisse ses réglages sans correspondance :

- « Événements orphelins (dans edit.json, absents du GLB : marqueur renommé ou retiré dans Blender) » : par événement,
  « Rattacher à… » (un événement du GLB de la même action ; son son remplace l'existant, après confirmation) ou
  « Supprimer » ;
- section « Entrées orphelines » (en bas) : par action, « Rattacher à… » (le libellé, l'icône et les sons remplacent ceux
  de l'action choisie, après confirmation) ou « Supprimer ».

Un orphelin restant est une **erreur** de vérification.

## 7. Onglet Ambiance

« Son d'ambiance » : menu des sons, « ▶ Écouter ». Joué en boucle par le lecteur après « Cliquer pour commencer » ; un
changement recharge la vue.

**Astuce** : préfère une boucle courte ; le son est gardé en mémoire entier sur le téléphone (environ 21 Mo par minute en
stéréo).

## 8. Onglet Quiz

Une question, 3 réponses, une seule bonne, une explication ; les 3 langues partout. Enregistré seulement complet.

- « Question » (FR, EN, ES).
- « Réponse 1 », « Réponse 2 », « Réponse 3 », chacune avec « bonne réponse » (une seule cochée).
- « Explication » : affichée après la bonne réponse.
- « Vider le quiz » (confirmation).

### 8.1 Aperçu

« Aperçu (FR) » (ou EN, ES) montre le quiz tel que le lecteur l'affiche, dès qu'il est complet dans la langue d'aperçu ; rien
n'est enregistré ni compté dans la progression. « Passer » remet le quiz à son début.

- Quiz complet dans la langue d'aperçu, pas dans les autres : « Quiz incomplet, non enregistré : à traduire en … ».
- Quiz incomplet dans la langue d'aperçu : « Aperçu impossible en … : … à compléter. »
- Rien de saisi : « Pas de quiz pour cette scène : la scène s'ouvre sans question. »

**Attention** : la fenêtre « Bravo ! » de la bonne réponse est celle du livre ; elle couvre toute la page de l'atelier
jusqu'à « Passer », Échap ou un clic à côté.

## 9. Onglet Carte

La carte de collection est gagnée à la première action jouée dans la scène. Le paragraphe est obligatoire, le reste
facultatif. Les textes incomplets ou trop longs restent dans la page (« Saisie incomplète »), le reste s'enregistre.

### 9.1 Type

- Livre à un seul type : « Un seul type (personnage) ; ajouter des types dans le studio, « Informations du livre ». »
- Livre à plusieurs types : menu « Type de la carte » ; le premier type est marqué « (par défaut) » pour une carte sans
  type. Le type choisi est écrit dans la carte à l'enregistrement.
- Changer de type quand des valeurs ne font pas partie du nouveau type : « Retirer », « Garder » (elles restent dans la
  carte, signalées par la vérification, et reviennent si l'on repasse au type d'avant) ou « Annuler ».
- Type lu dans le fichier mais absent du livre : « « … » (absent du livre) », gardé jusqu'à un choix ; dans un livre à un
  seul type, « Retirer ce type ».

### 9.2 Contenu

- « Titre » : le nom de la scène (onglet Scène), avec « n° i / N » ; non modifiable ici.
- « Sous-titre » (FR, EN, ES, 40 caractères au plus) : nom scientifique, époque…
- « Illustration » : menu des images ; conseillé 3:2, 900 × 600, WebP. Aucune : image de chargement de la scène, sinon icône
  du livre.
- « Caractéristiques » : une ligne par intitulé du type (intitulés réglés dans le studio), valeur de 16 caractères au plus,
  en FR, EN, ES ou une seule valeur avec « même valeur dans les 3 langues » ; sans valeur, la carte affiche « — ». Les
  valeurs d'intitulés absents du type sont listées avec « Retirer ».
- « Paragraphe » (FR, EN, ES, 250 caractères au plus, obligatoire).
- « Vider la carte » (confirmation).

### 9.3 Aperçu

« Aperçu (FR) » montre la carte telle que le livre l'affiche (pastille du type et mise en page compacte compris), dès que le
paragraphe est écrit dans la langue d'aperçu.

- « Carte incomplète : à traduire en … » ;
- « Paragraphe coupé en bas de la carte en … : le raccourcir. » ;
- « Pas de carte pour cette scène : ni bandeau ni bouton « Carte » dans le livre. »

## 10. Onglet Crédits

- « Sons et images de la scène » : une carte par fichier utilisé (sons d'action, d'événement et d'ambiance, icônes, images),
  avec « Titre », « Auteur », « Licence », « Source ». État : « crédité », « incomplet (titre, auteur, licence) », « sans
  crédit : obligatoire (V-10) » pour un son, « sans crédit (facultatif) » pour une image.
- « Crédits d'assets non utilisés » : « Supprimer ce crédit ».
- « Modèles 3D (src_* du GLB, lecture seule) » : crédits écrits dans Blender (propriétés `src_name`, `src_author`,
  `src_license`, `src_url`).

Un crédit n'est enregistré qu'avec titre, auteur et licence. **Un son sans crédit est une erreur** de vérification.

## 11. Onglet Rapport

Le Rapport montre les messages de la vérification du livre (`book:check`), avec les mêmes textes, recalculés en direct ; tant
qu'une saisie n'est pas enregistrée, il la prend en compte (« (avec la saisie non enregistrée) »).

- En tête, « Saisie incomplète, non enregistrée (n) » : ce que la page garde sans l'écrire ; perdu si l'onglet est fermé.
- Résumé « n erreur(s), n avertissement(s) — livre entier » ; « scène affichée seulement » filtre la scène ouverte.
- Messages rangés par origine : « GLB (couche 3D) » (corrigé dans Blender), « edit.json (couche éditoriale) » (corrigé dans
  l'atelier ou à la main), « Fusion des deux couches » (cohérence entre le GLB et `edit.json`), « Contrôles du build »
  (références, clips, crédits, assets, livre).
- Chaque ligne commence par « ERREUR : » ou « avertissement : » ; une ligne qui finit par « → » mène au champ à corriger
  (« Aller au champ »).

Les actions et événements orphelins sont listés à part, avec un renvoi à l'onglet Actions.

## 12. Onglet Diagnostic

Le Diagnostic lit le GLB tel qu'il est, même sans `GLBI_ROOT` (une scène hors `book.json` n'a que cet onglet).

- « Fichier » : poids, générateur, extensions, nombre de nœuds, maillages, matériaux, textures, lumières.
- « GLBI_ROOT » : présence du nœud, `glbi_version`, lisibilité de `glbi_config`.
- « Clips » : nom, durée, pistes, nœuds, déclaré (idle, action) ou « non déclaré ». « Lire » joue un clip librement, avec
  « boucle » et « vitesse » (0 à 2×) ; « Arrêter (retour au mode boutons) ».
- « Maillages skinnés », « Nœuds porteurs d'extras », « Crédits des modèles (src_*, …) ».

## 13. Mini-jeu : entrée « Jeu »

Le menu « Scène » propose « Jeu (mini-jeu) » si `book.json` a un gabarit de jeu (studio, « Informations du livre », section
« Mini-jeu »). L'adresse devient `#/jeu`.

### 13.1 La page du jeu

- Au centre, le **vrai jeu**, jouable avec tes réglages (GLB source de `game/`). « Recommencer » relance une partie : les
  réglages modifiés se voient après « Recommencer ».
- « Meilleur score et commandes de l'essai : gardés dans cet onglet seulement, jamais dans le livre. »
- État et « Enregistrer » (Ctrl+S), comme pour une scène, sur `game/game.edit.json`.
- Sans GLB lisible : « Jeu non monté : GLB de game/ manquants ou illisibles (voir Rapport et Diagnostic). »

Onglets : « Règles », « Caméra », « Textes », « Sons », « Crédits », « Rapport » (le nombre d'erreurs du jeu entre
parenthèses), « Diagnostic ».

### 13.2 Règles

« Réglages de la partie » : vide = valeur par défaut du gabarit (en grisé) ; hors des bornes : non enregistré.

| Champ | Bornes |
|---|---|
| « Durée d'une partie (s) » | entier, bornes affichées sous le champ |
| « Vitesse du joueur, en course (m/s) » | bornes affichées |
| « Vitesse de fuite des proies (m/s) » | bornes affichées |
| « Rayon de détection (m) » | bornes affichées |
| « Points par capture » | entier, bornes affichées |
| « Réapparition d'une proie capturée » | « (défaut : oui) », « oui », « non » |

« Proies en même temps » : une ligne par sorte de proie (entité de `game/`, nombre), « Ajouter une sorte de proie »,
« Retirer » ; 12 proies au plus en tout. Aucune ligne, avec une seule sorte de proie : 8 proies.

### 13.3 Caméra, textes, sons, crédits

- « Caméra » : « Distance de la caméra au joueur (m) » ; caméra plongeante (environ 50° au-dessus de l'horizon) qui suit le
  joueur.
- « Textes du jeu » : « Titre du jeu (obligatoire) », « Consigne, écran avant « Jouer » (obligatoire) », « Message de fin
  (facultatif) ». En français, une espace ordinaire avant ? ! : ; ou après un guillemet ouvrant est signalée ; « Corriger »
  met des espaces insécables.
- « Sons du jeu » : « Capture d'une proie », « Bond », « Musique (en boucle pendant la partie) », « Fin de partie ».
- « Crédits » : comme pour une scène (§10) ; chaque son utilisé doit être crédité.

### 13.4 Rapport et Diagnostic du jeu

- Le Rapport est celui du livre entier, filtré par « jeu seulement ». Les budgets du gabarit (mesurés sur les GLB optimisés)
  s'y lisent en avertissements.
- Le Diagnostic décrit chaque GLB de `game/` (arène d'abord, puis chaque entité et son rôle) : poids de la source, GLBI_ROOT,
  `glbi_game_version`, `glbi_game_config`, clips et rôles, skins, crédits `src_*`. Les choix de l'addon (arène sans
  animations, entité sans lampes) sont présentés comme voulus, pas comme des défauts.

## 14. Enregistrer et confirmations

« Enregistrer » (ou Ctrl+S) écrit `scenes/<scène>.edit.json` (ou `game/game.edit.json` pour le jeu), et rien d'autre :

- seuls les champs complets et valides sont écrits ; le reste reste dans la page, listé dans « Saisie incomplète, non
  enregistrée » ;
- le fichier est validé par le contrat avant d'être écrit ; un refus affiche ses messages sous les onglets, et rien n'est
  écrit ;
- un fichier identique n'est pas réécrit ; une scène ouverte puis enregistrée sans modification reste identique octet pour
  octet.

Confirmations :

- changer de scène, de jeu ou fermer l'onglet avec une saisie non enregistrée : « Modifications non enregistrées sur « … » :
  les abandonner ? » (ou « … pour ouvrir « … » ? ») ;
- `edit.json` modifié hors de l'atelier : bandeau « edit.json a été modifié hors de l'atelier ; ta saisie non enregistrée est
  gardée (Enregistrer l'écrasera). », bouton « Reprendre le fichier du disque » ; « Enregistrer » demande « … a été modifié
  hors de l'atelier : l'écraser avec la saisie ? » ;
- `edit.json` refusé par son schéma : « edit.json refusé : aperçu avec la couche 3D seule (voir Rapport) » ; le formulaire
  reprend ce qui est lisible et « Enregistrer » réécrit le fichier.

Un réexport depuis Blender est pris en compte tout seul : la scène se recharge et ta saisie non enregistrée est gardée.

## 15. Limites connues

- **Non disponible** : import d'une image ou d'un son dans l'atelier : dépose les fichiers dans le dossier du livre.
- **Non disponible** : aperçu du GLB optimisé : l'atelier montre les GLB source ; les poids et budgets optimisés se lisent
  dans le Rapport.
- **Non disponible** : lecture libre d'un clip dans le Diagnostic du jeu.
- Une saisie incomplète n'est gardée que dans l'onglet : fermer l'onglet la perd.
- Le lecteur de l'atelier garde l'écran « Cliquer pour commencer » (le livre publié démarre seul) ; tant qu'il est affiché,
  la souris ne tourne pas la vue.
- Si le studio fait changer de scène un onglet de l'atelier resté en arrière-plan avec une saisie non enregistrée, la
  confirmation peut n'apparaître qu'au retour sur l'onglet, selon le navigateur.
- Ce qui vient de la couche 3D (actions, clips, boucle, transition, cible et position de la caméra, marqueurs) ne se modifie
  pas ici : corriger dans Blender, puis exporter avec l'addon.
- `book.json` (scènes, intitulés et types de cartes, jeu) ne se modifie pas ici : studio, « Modifier le livre… ».
