# Étape : spec

But : une spec fonctionnelle que le propriétaire valide (porte 1).

**Qui fait quoi.** Tout ce que cette étape demande de réfléchir ou de rédiger est fait par un sous-agent du rôle `plan`,
lancé avec la description `[role:plan:amont]` (« Phase amont » dans AGENT.md) : donne-lui ce fichier à suivre et dis-lui
qu'il n'écrit rien sur GitHub (commentaire, label, issue, PR) et ne pousse rien : là où ce fichier dit « publie »,
« mets le label » ou « ouvre une issue », il écrit le texte dans un fichier et te le rend. Toi, tu publies son texte,
terminé par la ligne de `node .factory/scripts/upstream.mjs <n> <fichier>`, et tu poses les labels.

1. Relis l'issue, tout le grilling et ses remarques éventuelles sur une version précédente de la spec.
2. Charge le skill `to-spec` s'il est installé et rédige la spec **en français**, orientée utilisateur :
   - ce que la feature permet, en une phrase, sur une ligne qui commence par `**En une phrase** :` (le sommaire des
     specs rangées la reprend) ;
   - si le grilling a laissé des évidences sans les poser en questions (étapes 0 ter et 3 ter de `grilling.md`), une
     courte partie `### Ce que j'ai décidé pour vous` juste après la phrase « En une phrase » : une ligne par choix,
     concrète (« le bouton s'appellera Archiver », « il apparaît aussi sur téléphone »), pour qu'il réagisse d'un coup
     d'œil. Pas de cette partie quand l'étape des questions est désactivée ou pour un sujet purement technique ;
   - les parcours, écran par écran, en langage simple ;
   - les règles et cas limites décidés ;
   - ce qui est hors périmètre ;
   - les critères d'acceptation, sous forme de vérifications qu'il pourra faire lui-même sur la preview.
   Si les questions ont produit des documents (voir `.factory/stages/docs.md`), ajoute la phrase de résumé en français.
   **Pas encore d'estimation de ta part sur l'issue** (projet sans étape de questions) : publie-la d'abord (« Avant tout : taille de la
   demande » dans `.factory/stages/grilling.md`).
   **Petite demande** (voir « Taille d'une demande » dans AGENT.md) : spec courte, quelques lignes seulement :
   `**En une phrase** :`, « Ce qui change » et « Comment vérifier » (sans parcours écran par écran ni hors périmètre).
   Elle suit ensuite la même règle de validation (étape 4) : une petite spec sensible se fait toujours valider.
   **Questions sautées** (seulement quand tu arrives de l'étape 0 ter de `grilling.md`, jamais si l'étape des
   questions est désactivée) : la spec commence, juste
   sous son titre, par la phrase « Pas de questions : la demande était claire. »
3. Publie-la en commentaire, qui commence par `<!-- factory-agent -->` puis `<!-- factory-spec -->` et un
   titre `## Spec (version N)`, et se termine, juste avant la signature, par la ligne de preuve
   (`upstream.mjs`). Une nouvelle version remplace l'ancienne : ne modifie pas les anciens commentaires.
4. **Faut-il la faire valider ?** Oui si l'étape « validation de chaque spec » est active (voir AGENT.md).
   Sinon, oui seulement si la spec est **sensible** : elle peut faire perdre ou effacer des données, touche à
   l'argent, à la sécurité, aux comptes ou au partage de données personnelles, change la vision ou le design
   validés, ou repose sur une hypothèse importante que le grilling n'a pas confirmée.
   Une spec écrite avec les questions sautées n'est en principe pas sensible (sinon les questions auraient été posées) ;
   si en l'écrivant tu découvres un point sensible, demande quand même la validation. Les évidences de « Ce que j'ai
   décidé pour vous » ne sont pas des hypothèses importantes non confirmées.
   - **À valider** : termine par « Répondez « go » pour lancer la construction, ou dites-moi ce qu'il faut
     changer. » (et, si la validation est désactivée, dis en une phrase pourquoi tu demandes quand même).
   - **Pas à valider** : termine par « Je lance la construction sans attendre votre validation (réglage du
     projet). Si quelque chose ne va pas, écrivez-le ici : j'en tiendrai compte. »
4 bis. **Feature trop grosse pour une seule construction ?** (plusieurs écrans indépendants, ou plus d'une demi-journée
   de travail selon toi) : découpe-la avec le skill `to-tickets` s'il est installé, en tranches qui se livrent et se
   testent chacune seule. Cette issue garde la première tranche (la spec ne décrit qu'elle, avec une ligne « Ensuite : »
   qui liste les autres). Ouvre une issue par autre tranche, titre et texte en français, même si un skill de
   découpage propose des titres ou rubriques en anglais (voir « Ouvrir une issue » dans AGENT.md, avec
   `factory:kept` : elles viennent de sa demande), dont la description contient sa partie de la spec,
   `Découpée de #<n>.` et le marqueur `<!-- factory-split -->` ; elles partiront en parallèle quand une place se
   libère. Le sous-agent écrit le texte de chaque tranche dans son fichier et c'est toi qui ouvres ces issues : lui
   n'écrit rien sur GitHub et ne pousse rien.
5. Labels de l'issue : retire `factory:grilling`, ajoute `factory:spec-review`, et aussi `factory:auto-go`
   si la spec n'est pas à valider : la construction démarrera dès la fin de ce run.
