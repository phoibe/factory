# Étape : cadrage du projet

But : une vision commune du produit et un choix de stack, validés par le propriétaire, avant toute feature.
Cette étape a lieu une fois par projet, sur l'issue « Nouveau projet » (label `factory:project`).

**Projet commencé sans la factory ?** S'il n'y a pas de fiche produit mais que le dépôt contient déjà une
application (un `package.json`, du code source), c'est une **adoption** :

- Lis d'abord le code (et lance l'appli si tu peux) pour comprendre ce qu'elle fait déjà. Ton premier round
  commence par **Ce que j'ai compris** : à quoi sert l'appli, pour qui, ses écrans et ses fonctions actuels,
  en langage simple. Puis ne pose que les questions sur ce que le code ne dit pas (le but, ce qui vient
  ensuite, ce qui est hors sujet).
- **Design** : propose de garder le look actuel (impeccable le documentera tel quel) ou d'en choisir un
  nouveau ; seulement dans ce cas, passe par le questionnaire design et la direction visuelle.
- **Stack** : garde celle en place. N'en propose une autre que si le propriétaire le demande ou si elle
  empêche vraiment un besoin décidé.
- **Hébergement** : regarde toi-même si le dépôt est déjà déployé quelque part (déploiements et environnements
  GitHub, fichiers de configuration d'hébergeur à la racine, GitHub Pages, commentaires de bots d'hébergeur sur les anciennes PR,
  adresse du site dans le README). S'il l'est, garde cet hébergeur et ne demande rien. Sinon, propose-en un
  avec la stack, comme pour un nouveau projet.
- La fiche finale décrit l'appli telle qu'elle est plus ce qui vient ensuite ; « Première version » devient
  **Prochaines features**.

**Projet déjà cadré ?** Si `PRODUCT.md` (ou `docs/PRODUCT.md`) existe déjà, c'est une **révision du
cadrage** : ne repose aucune question déjà réglée. Demande d'abord, en une question, ce que le propriétaire
veut changer (vision, usages, périmètre, design, stack), puis ne pose que les questions que ce changement
ouvre (questionnaire design et direction visuelle seulement si le design change ; stack seulement si elle
change). La fiche publiée à la fin est la fiche complète mise à jour, avec en tête une section
**Ce qui change** (une ligne par changement).

## Les questions (rounds de grilling)

1. Charge le skill `grilling` et applique-le **en asynchrone** : un round = un commentaire, puis tu termines.
   Si `grill-with-docs` est installé, lis aussi `.factory/stages/docs.md` : il remplace `grilling` et ajoute le
   glossaire et les décisions (petite PR de documents à la publication de la fiche).
2. Relis l'issue et toutes les réponses déjà données. Ne pose que les questions encore ouvertes dont les
   prérequis sont réglés. Maximum 8 questions par round, numérotées, chacune avec ta recommandation (➡️) et
   formulée pour qu'un « oui » l'accepte. Termine par : « Répondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ». »
3. Ce qu'il faut décider, dans cet ordre :
   - **pour qui** et **dans quel but** (le problème réglé, en une phrase) ;
   - **les usages principaux** et ce que la toute première version doit permettre ;
   - **hors sujet** : ce que l'appli ne fera pas ;
   - **données et accès** : comptes ou non, plusieurs appareils, partage, données sensibles ;
   - **le design**, dans ses propres rounds (voir « Le questionnaire design » puis « La direction visuelle ») ;
   - **la stack**, en dernier (voir ci-dessous).
4. Laisse le label `factory:grilling` tant qu'il reste des questions.

## Le questionnaire design

But : réunir tout ce dont le skill `impeccable` a besoin pour écrire les documents de design (`PRODUCT.md`
et `DESIGN.md`) et donner à l'appli une interface soignée et un look qui lui ressemble. Lis d'abord, dans
`.claude/skills/impeccable/`, `SKILL.md` puis `reference/init.md` et `reference/new-work.md` (sections 1 à 4) :
ce sont eux qui disent ce qui compte. La règle « Textes à l'écran » de `.factory/stages/design-pass.md`
vaut pour tout projet sans question à poser : rappelle-la à `impeccable`, elle ira dans `DESIGN.md`.
Si l'étape « passe design » est désactivée, réduis ce questionnaire à
une seule question sur le ton et l'apparence.

Pose ces questions en un ou deux rounds à part, **après** celles sur le produit, en langage de tous les
jours. Chacune avec ta recommandation (➡️) tirée de ce qu'il a déjà dit. Ne demande **jamais** de valeur
technique (couleur en code, taille de police, nom de style tout fait) : demande des situations, des
ressentis et des exemples. Ce qu'il faut savoir :

1. **La scène d'usage** : où, quand et sur quel écran il s'en sert (téléphone le soir au lit, ordinateur au
   bureau, dehors en plein soleil…). C'est elle qui décide clair ou sombre, la taille des boutons, la densité.
2. **Le ressenti** : trois mots pour ce qu'il doit éprouver en l'ouvrant (calme, fier, motivé, amusé…), et
   ce qui le ferait se sentir mal (infantilisé, culpabilisé, noyé…).
3. **Les inspirations** : deux ou trois applis, sites, objets ou lieux dont il aime le look, et pourquoi en
   une phrase ; puis un ou deux qu'il n'aime pas. Aide-le avec des exemples s'il sèche.
4. **Ce qui existe déjà** : un nom définitif, un logo, des couleurs ou des images à garder, ou rien.
5. **La personnalité** : plutôt discrète et sérieuse, chaleureuse, ou joueuse ; et le ton des textes
   (tutoiement ou vouvoiement, sobre ou avec de l'humour).
6. **La densité** : peu d'éléments très aérés, ou beaucoup d'informations d'un coup d'œil.
7. **Le mouvement** : animations et petites récompenses visuelles bienvenues, discrètes, ou aucune.
8. **L'accessibilité** : un besoin particulier (vue, daltonisme, gros caractères, usage d'une seule main).

N'en garde que celles dont la réponse n'est pas déjà claire. S'il répond « comme vous voulez » à une question,
note-la « déléguée » et choisis toi-même à partir de ses autres réponses.

## La direction visuelle

Quand le questionnaire est réglé, propose le monde visuel de l'appli dans un round à lui, en suivant la
section « Create or replace the visual world » de `reference/new-work.md` (lance son script `concept-seed`
s'il est disponible ; sinon dérive les directions toi-même en suivant la même méthode). La page de choix
interactive du skill n'est pas utilisable ici : présente les directions dans le commentaire.

- **Deux ou trois directions** très différentes, numérotées, chacune en quatre lignes simples : l'univers
  dont elle s'inspire et pourquoi il lui va, les couleurs décrites en mots (« vert sapin profond, fond
  papier crème »), le caractère des textes (« titres arrondis et généreux »), le petit détail qui la rend
  reconnaissable, et le risque honnête.
- **Ta recommandation** (➡️) et pourquoi, en une phrase.
- **La sortie sûre** : une dernière option « classique, comme les meilleures applis du genre », jamais
  recommandée.
- Termine par : « Répondez par le numéro de la direction, ou dites ce qu'il faudrait changer. »

S'il demande autre chose (plus sobre, plus audacieux, un mélange), propose une nouvelle série.

## Choisir la stack

Propose la technique dans un round à elle, **en langage simple**. **Aucune brique n'est imposée d'avance** et
aucune n'a de bonus : pars uniquement des besoins décidés plus haut et de ta maîtrise réelle de chaque
technologie.

Présente **deux ou trois stacks complètes**, numérotées, chacune sérieuse et adaptée au besoin (deux suffisent
souvent, trois quand le besoin s'y prête, jamais plus). Elles diffèrent sur la **pièce maîtresse**, la façon de
construire l'appli, pas seulement sur un détail (même base avec une autre bibliothèque d'icônes ne compte pas).
Pour chacune, en quelques lignes simples :

- ce qu'elle apporte au propriétaire (pas son fonctionnement) ;
- son point faible, dit honnêtement ;
- les comptes qu'il aurait à créer (gratuits), ou « aucun » ;
- où l'appli serait hébergée ;
- ta maîtrise de cette stack, dite franchement : « très bonne », « bonne » ou « moyenne ».

Puis ta recommandation (➡️) et pourquoi, en deux phrases.

Critères pour construire et départager les stacks :

1. **Adaptée au besoin**, sans surdimensionner.
2. **Robustesse éprouvée** : des technologies mûres, très répandues, utilisées en production depuis des
   années. **Pas la dernière nouveauté à la mode**, ni une version sortie il y a quelques mois.
3. **Bien connue de toi** : très documentée, avec beaucoup d'exemples fiables dans ce que tu as appris. Si tu
   hésites sur ta maîtrise d'une techno, dis-le et préfère une plus classique.
4. **Réutiliser plutôt que réinventer** : prends des briques toutes faites qui apportent beaucoup de fonctions
   prêtes à l'emploi, par exemple une base de données gérée, des composants d'interface tout faits, une
   authentification toute prête. Ce sont des genres de briques, à choisir selon le besoin : ne cite ici aucun
   produit par habitude. Ne réécris jamais ce qu'une brique établie fait déjà.
5. **Gratuit** à l'usage personnel (offres gratuites).
6. **Compatible avec les contrôles automatiques** de la factory : ils lancent les scripts npm `typecheck`,
   `lint`, `test`, `build` et `test:a11y`. Une stack hors de l'écosystème JavaScript reste possible avec un
   `package.json` qui lance ses propres outils sous ces noms (et Playwright pour `test:a11y`) : compte-le
   alors dans son point faible.

**Hébergement** : il fait partie de la stack, et l'hébergeur se choisit avec la stack, sur les mêmes critères
(adapté, gratuit, robuste). L'installation n'en branche aucun et aucun n'est choisi par défaut : propose celui qui
va le mieux avec la stack et le besoin, avec une alternative écartée et pourquoi. Un hébergeur déjà branché sur un
projet plus ancien (souvent Vercel) n'a aucun bonus : on le débranche si un autre est retenu.
La factory affiche les aperçus de tout hébergeur qui signale ses déploiements à GitHub ; préfère-en un qui le fait.
Un projet sans aperçu passe directement à la suite. Tu ne te connectes jamais au compte du propriétaire
chez un hébergeur : s'il faut un compte, les clics restent les siens.
Pour les pages gratuites de GitHub, vérifie d'abord la visibilité du dépôt (`gh api repos/<dépôt> --jq .private`) :
sur un dépôt privé et un compte gratuit, elles ne marchent pas (il faut un abonnement payant, et le site serait
public quand même). Sur un dépôt privé, propose plutôt un autre hébergeur gratuit ; tu peux mettre en alternative
« rendre le dépôt public » en disant clairement que tout le code deviendrait visible par tout le monde. Ne change
jamais la visibilité du dépôt sans son « oui » écrit à cette question.

## La fiche projet (porte 1)

Quand tout est décidé, publie un commentaire qui commence par `<!-- factory-agent -->` puis
`<!-- factory-brief -->` et le titre `## Fiche projet (version N)`, en français :

- **Vision** : pour qui, quel problème, en deux ou trois phrases ;
- **Usages principaux** ;
- **Première version** : la liste des features, une ligne chacune (chacune deviendra une issue) ;
- **Hors sujet** ;
- **Design** : la scène d'usage, les trois mots du ressenti, les inspirations et anti-inspirations, ce qui
  existe déjà, la personnalité et le ton, la densité, le mouvement, l'accessibilité, puis la direction
  visuelle choisie avec ses quatre lignes ;
- **Stack** : chaque brique avec sa raison en une phrase, **hébergeur compris** ;
- **Hébergement** : où l'appli sera en ligne et, si ce n'est pas l'hébergeur déjà branché, quoi créer et où
  cliquer, et comment débrancher l'hébergeur déjà branché, s'il y en a un ;
- **Ce dont tu auras besoin de créer toi-même** (comptes, services gratuits), ou « rien » ;
- **Si l'hébergeur retenu demande un compte** et que le dépôt n'y est pas déjà branché, un
  encadré (citation `>`) intitulé **« Avant de répondre « go » : brancher l'hébergeur »**, juste avant la phrase
  de fin : les liens exacts pour ce dépôt et les clics à faire, en général deux (donner à l'hébergeur l'accès au
  dépôt depuis son application GitHub, puis importer le dépôt chez lui), en disant qu'ainsi la toute première PR
  aura déjà son aperçu. Préviens qu'un premier échec du déploiement est normal tant que l'appli n'existe pas encore.
  Écris des liens cliquables (pas en format code), avec le vrai nom du dépôt.
  Si l'hébergeur ne demande aucun compte (par exemple GitHub Pages pour un site simple), pas d'encadré : dis
  seulement que tu le mets en place toi-même dans la PR des fondations, sans rien lui demander.

Termine par : « Répondez « go » pour que je pose les fondations de l'appli, ou dites-moi ce qu'il faut changer. »
Labels de l'issue : retire `factory:grilling`, ajoute `factory:spec-review`.

Si le propriétaire demande des changements sur une fiche déjà publiée, publie une nouvelle version complète
(ne modifie pas l'ancien commentaire), ou pose les questions nécessaires en remettant `factory:grilling`.
