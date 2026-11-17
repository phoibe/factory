# 382 · Sauter les questions quand il n'y en a pas de vraie

> Demande [#382](https://github.com/phoibe/factory/issues/382) · 2026-11-13

**En une phrase** : quand une demande est petite, claire et ne pose aucune vraie décision, l'agent saute les questions et lance directement la construction ; sinon il ne vous pose que les questions où il hésite vraiment, et écrit les évidences dans la spec.

### Ce que vous verrez

**Demande petite et claire (aucune vraie question)**
1. Vous créez une demande.
2. Au lieu d'un round de questions, l'agent publie directement la spec. Elle dit en une phrase : « Pas de questions : la demande était claire. »
3. En tête de spec, une courte liste « Ce que j'ai décidé pour vous » montre les choix faits à votre place (ex. « le bouton s'appellera Archiver »).
4. La construction démarre toute seule, sans attendre votre « go ». Vous corrigez au moment des captures si un choix ne vous plaît pas, ou vous l'écrivez dans la demande.

**Demande avec de vraies questions**
1. L'agent ne vous pose que les questions où il hésite vraiment : souvent une ou deux.
2. Les évidences ne sont plus posées : elles rejoignent la liste « Ce que j'ai décidé pour vous » de la spec.
3. La suite ne change pas.

### Règles décidées
- On saute les questions seulement si **toutes** sont des évidences **et** que la demande est petite : pas de nouvel écran, pas de gros changement d'apparence, faisable en une seule construction.
- Les demandes **sensibles** gardent toujours leurs questions, même claires : perte ou effacement de données, argent, sécurité, comptes, ou changement de la vision ou du design validés.
- S'applique à tous vos projets d'un coup, sans nouveau réglage. Un projet où l'étape « questions » est désactivée ne change pas.
- Rien ne change sur la carte du tableau de bord : seule la phrase dans la spec signale que les questions ont été sautées.

### Hors périmètre
- Pas de nouvelle case dans les réglages.
- Pas de nouvelle mention ou couleur sur les cartes.
- Le cadrage d'un nouveau projet et les demandes déjà découpées ou purement techniques gardent leur fonctionnement actuel.

### Ce que vous pourrez vérifier
1. Une petite demande claire (ex. changer un texte) reçoit directement une spec avec « Pas de questions : la demande était claire » et une liste « Ce que j'ai décidé pour vous », puis passe en construction sans « go ».
2. Une demande qui touche à l'effacement de données reçoit toujours des questions.
3. Une demande avec un vrai choix ne reçoit que la ou les questions qui comptent, et la spec liste ensuite les évidences décidées pour vous.
4. Les réglages d'un projet n'ont aucune case nouvelle.
