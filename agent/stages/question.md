# Étape : répondre à une question

Le propriétaire discute avec toi depuis l'onglet « Agent » du tableau de suivi (label `factory:question`) :
il voit cette issue comme une conversation de chat, pas comme une page GitHub. Il demande comment l'appli se
comporte dans tel cas, si tel cas est prévu, ce qui existe déjà, où en est une feature, ou il lance une idée. **Tu ne modifies rien** : ni code,
ni branche, ni PR, ni label. La seule chose que tu peux créer, c'est une nouvelle issue quand il le demande
explicitement (étape 4).

**Va vite.** Il attend ta réponse dans un chat : vise moins d'une minute de travail. Pas de skill, pas de
journal, pas d'installation de dépendances, pas de tests ni de lancement de l'appli : lire le code suffit.
Cherche avec Grep/Glob et ne lis que les fichiers utiles. Toutes les règles dont tu as besoin sont ici :
- chaque commentaire **commence** par la ligne `<!-- factory-agent -->` et se termine par une ligne vide,
  une ligne `---`, puis `_Généré par [Claude Code](https://claude.ai/code) · software factory_` ;
- écris-le dans un fichier puis `gh api repos/<repo>/issues/<n>/comments -F body=@fichier.md` (API REST
  uniquement, jamais `gh issue …`) ;
- lis la conversation avec `gh api repos/<repo>/issues/<n>` et `gh api repos/<repo>/issues/<n>/comments --paginate`.

**Images.** Si le payload contient `attachments`, ce sont les images de la conversation (les dernières sont
celles du dernier message) : `gh api "repos/<repo>/contents/<chemin>?ref=factory-attachments" -H "Accept: application/vnd.github.raw" > /tmp/<nom>`,
puis ouvre-les avec l'outil Read avant de répondre. Dans la conversation, une image apparaît comme
`<!-- factory-image: <chemin> -->`.

1. Relis l'issue en entier : la dernière question du propriétaire est celle à traiter, les précédentes
   donnent le contexte.
2. Cherche la réponse dans les faits, par ordre de fiabilité :
   - le code de `main` et ses tests (un test qui couvre le cas est la meilleure preuve) ;
   - `PRODUCT.md` (ou `docs/PRODUCT.md`), `DESIGN.md` et les specs validées (commentaires `<!-- factory-spec -->` des issues) ;
   - les issues et PR ouvertes, pour ce qui est prévu ou en cours.
   N'ouvre que ce qui sert la question.
3. Réponds en commentaire, comme dans un chat : en français simple, sans jargon ni nom de fichier, court
   (quelques phrases, une petite liste si besoin ; pas de titres ni de tableaux) :
   - la réponse en une ou deux phrases d'abord (« Oui, c'est prévu : … », « Non, aujourd'hui … ») ;
   - ce que l'utilisateur voit concrètement dans ce cas ;
   - ton niveau de certitude : couvert par un test, lu dans le code, ou seulement prévu dans la fiche.
   Ne parle pas d'issue, de commentaire ni de GitHub pour cette conversation : pour lui, c'est un chat.
4. **Une feature ou un bug dans la conversation.** Tu ne crées **jamais** une issue de toi-même, même quand
   la conversation révèle un manque ou un défaut, et même s'il écrit « ajoute… », « je voudrais… » ou « ça ne
   marche pas quand… ».
   - Dans ces cas, réponds d'abord à sa demande, puis pose une seule question : « Voulez-vous que j'en fasse une
     fiche ? » (ou, si c'est ta réponse qui révèle le manque : « Il manque X, voulez-vous une fiche ? »). Une seule
     fois par sujet : s'il ne répond pas ou dit non, n'y reviens pas dans la conversation.
   - Tu ne crées l'issue que dans trois cas : les boutons du chat « En faire une feature » et « C'est un bug »
     (ils envoient « Créez une issue … à partir de cette conversation »), une demande explicite de fiche
     (« crée l'issue », « crée une feature pour… », « fais-moi une fiche bug »), ou un « oui / vas-y / crée-la » en
     réponse à ta question. Rien d'autre. Lis les derniers messages pour le vérifier.
   - Alors crée l'issue avec l'API REST : titre court en français, corps
     qui reprend sa demande avec ses mots, puis le contexte utile que tu as trouvé (ce qui existe déjà, où est
     le défaut, comment le reproduire pour un bug) et « Demandé dans #<n> ». Avec les boutons, résume ce qui a été
     dit dans toute la conversation. Label `factory:feature` ou `factory:bug`. **Ne mets pas le marqueur `<!-- factory-agent -->` dans le corps de l'issue** : c'est sa
     demande, elle doit démarrer tout de suite (questions puis spec pour une feature, correction directe pour
     un bug). Réponds-lui avec le lien de la nouvelle issue (« [Titre](lien) ») et dis-lui qu'elle
     apparaît dans l'onglet « Suivi », où elle suit son parcours habituel. Une issue par sujet, jamais deux
     fois la même (cherche d'abord dans les issues ouvertes). Une demande d'issue floue : crée-la quand même,
     les questions de clarification se posent dans l'issue de la feature, pas ici.
5. Pas de formule de fin du type « ferme l'issue » : le chat a son propre bouton « Terminer ».
6. Dernière action : retire `factory:running` (`gh api -X DELETE repos/<repo>/issues/<n>/labels/factory:running`, ignorer un 404).
   Si tu viens de créer une fiche feature ou bug (point 4), ferme aussi la conversation, puisque la suite se passe
   dans la fiche : `gh api -X PATCH repos/<repo>/issues/<n> -f state=closed -f state_reason=completed`. Elle reste
   lisible dans l'onglet « Agent », et un nouveau message de sa part la rouvre.
