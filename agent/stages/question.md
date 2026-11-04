# Étape : répondre à une question

Le propriétaire pose une question sur le projet (label `factory:question`) : comment l'appli se comporte dans
tel cas, si tel cas est prévu, ce qui existe déjà, où en est une feature. **Tu ne modifies rien** : ni code,
ni branche, ni PR, ni label. La seule chose que tu peux créer, c'est une nouvelle issue quand il le demande
(étape 4).

1. Relis l'issue en entier : la dernière question du propriétaire est celle à traiter, les précédentes
   donnent le contexte.
2. Cherche la réponse dans les faits, par ordre de fiabilité :
   - le code de `main` et ses tests (un test qui couvre le cas est la meilleure preuve) ;
   - `PRODUCT.md` (ou `docs/PRODUCT.md`), `DESIGN.md` et les specs validées (commentaires `<!-- factory-spec -->` des issues) ;
   - les issues et PR ouvertes, pour ce qui est prévu ou en cours.
   Si besoin, lance l'appli localement pour vérifier un comportement plutôt que de le deviner.
3. Réponds en commentaire, en français simple, sans jargon ni nom de fichier :
   - la réponse en une ou deux phrases d'abord (« Oui, c'est prévu : … », « Non, aujourd'hui … ») ;
   - ce que l'utilisateur voit concrètement dans ce cas ;
   - ton niveau de certitude : vérifié (test ou essai), lu dans le code, ou seulement prévu dans la fiche.
4. **Une feature ou un bug dans la conversation.**
   - S'il **demande** une nouvelle feature ou signale un bug (« ajoute… », « je voudrais… », « ça ne marche
     pas quand… », « crée l'issue »), crée toi-même l'issue avec l'API REST : titre court en français, corps
     qui reprend sa demande avec ses mots, puis le contexte utile que tu as trouvé (ce qui existe déjà, où est
     le défaut, comment le reproduire pour un bug) et « Demandé dans #<n> ». Label `factory:feature` ou
     `factory:bug`. **Ne mets pas le marqueur `<!-- factory-agent -->` dans le corps de l'issue** : c'est sa
     demande, elle doit démarrer tout de suite (questions puis spec pour une feature, correction directe pour
     un bug). Réponds-lui avec le lien de la nouvelle issue, et dis-lui que la suite se passe là-bas.
   - Si c'est seulement ta réponse qui révèle un manque ou un défaut, ne crée rien : propose-le en une phrase
     et demande-lui s'il veut que tu crées l'issue (il répondra ici).
   - Une demande floue ? Crée quand même l'issue : les questions de clarification se posent dans l'issue de
     la feature, pas ici. Une issue par sujet, jamais deux fois la même (cherche d'abord dans les issues ouvertes).
5. Termine par : « Tu peux poser une autre question ici, ou fermer l'issue si c'est bon. »
6. Dernière action, comme toujours : retire `factory:running`.
