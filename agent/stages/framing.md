# Étape : cadrage du projet

But : une vision commune du produit et un choix de stack, validés par le propriétaire, avant toute feature.
Cette étape a lieu une fois par projet, sur l'issue « Nouveau projet » (label `factory:project`).

## Les questions (rounds de grilling)

1. Charge le skill `grilling` et applique-le **en asynchrone** : un round = un commentaire, puis tu termines.
2. Relis l'issue et toutes les réponses déjà données. Ne pose que les questions encore ouvertes dont les
   prérequis sont réglés. Maximum 8 questions par round, numérotées, chacune avec ta recommandation (➡️) et
   formulée pour qu'un « oui » l'accepte. Termine par : « Réponds par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ». »
3. Ce qu'il faut décider, dans cet ordre :
   - **pour qui** et **dans quel but** (le problème réglé, en une phrase) ;
   - **les usages principaux** et ce que la toute première version doit permettre ;
   - **hors sujet** : ce que l'appli ne fera pas ;
   - **données et accès** : comptes ou non, plusieurs appareils, partage, données sensibles ;
   - **ton et apparence** : sobre, ludique, mobile d'abord ou ordinateur ;
   - **la stack**, en dernier (voir ci-dessous).
4. Laisse le label `factory:grilling` tant qu'il reste des questions.

## Choisir la stack

Propose une stack dans un round à elle, **en langage simple** : pour chaque brique, ce qu'elle apporte au
propriétaire (pas son fonctionnement), puis une alternative écartée et pourquoi. Critères, par ordre :

1. **Couvrir les besoins** décidés plus haut, sans surdimensionner.
2. **Établie et très documentée** : des technologies mûres, très répandues, sur lesquelles tu as beaucoup de
   connaissances fiables. **Pas la dernière nouveauté à la mode**, ni une version sortie il y a quelques mois.
   Si tu hésites sur ta maîtrise d'une techno, choisis-en une plus classique.
3. **Réutiliser plutôt que construire** : préfère les briques complètes qui apportent beaucoup de fonctions
   déjà faites (base de données gérée comme Neon, authentification toute prête, bibliothèques de composants
   reconnues). Ne réécris jamais ce qu'une brique établie fait déjà.
4. **Gratuit** à l'usage personnel (offres gratuites), hébergé sur Vercel par défaut.

Point de départ : {{stack}}. Garde-le si rien dans les besoins ne justifie de s'en écarter.

## La fiche projet (porte 1)

Quand tout est décidé, publie un commentaire qui commence par `<!-- factory-agent -->` puis
`<!-- factory-brief -->` et le titre `## Fiche projet (version N)`, en français :

- **Vision** : pour qui, quel problème, en deux ou trois phrases ;
- **Usages principaux** ;
- **Première version** : la liste des features, une ligne chacune (chacune deviendra une issue) ;
- **Hors sujet** ;
- **Stack** : chaque brique avec sa raison en une phrase ;
- **Ce dont tu auras besoin de créer toi-même** (comptes, services gratuits), ou « rien ».

Termine par : « Réponds « go » pour que je pose les fondations de l'appli, ou dis-moi ce qu'il faut changer. »
Labels de l'issue : retire `factory:grilling`, ajoute `factory:spec-review`.

Si le propriétaire demande des changements sur une fiche déjà publiée, publie une nouvelle version complète
(ne modifie pas l'ancien commentaire), ou pose les questions nécessaires en remettant `factory:grilling`.
