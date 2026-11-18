# 492 · Confirmer d'un clic les demandes proposées par l'agent

> Demande [#492](https://github.com/phoibe/factory/issues/492) · 2026-11-18

**En une phrase** : quand l'agent de l'onglet « Agent » propose un bug ou une feature, rien n'est créé tant que vous n'avez pas cliqué « Créer cette demande ».

### Ce que j'ai décidé pour vous
- Une fois confirmée, la demande suit son parcours habituel : un bug démarre tout de suite, une feature rejoint la file d'attente.
- Une carte pas encore traitée reste dans la conversation, même si vous fermez le tableau et revenez plus tard ; après votre choix, elle affiche « Créée » avec le lien, ou « Ignorée ».
- La même règle vaut pour le mode de secours du chat (quand le serveur de discussion n'est pas disponible) : l'agent n'y crée plus rien lui-même.
- L'agent garde sa règle actuelle : il ne propose une fiche que si vous l'avez demandée (ou acceptée).

### Le parcours
1. Dans l'onglet « Agent », vous discutez avec l'agent ; il vous propose une demande (parce que vous le lui avez demandé, ou après un clic sur « Nouvelle feature » / « Signaler un bug » en bas du chat).
2. Sous sa réponse apparaît une **carte** : le type (bug ou feature), le titre, et le texte qu'il a rédigé, repliable pour le lire en entier. Deux boutons : **« Créer cette demande »** et **« Ignorer »**.
3. **Vous cliquez « Créer cette demande »** : la demande est créée, la carte affiche « Créée » avec le lien vers la demande. Un bug démarre aussitôt, une feature rejoint la file.
4. **Vous cliquez « Ignorer »** : rien n'est créé, la carte affiche « Ignorée ». Si vous voulez une autre version, vous le dites à l'agent dans le chat (« plutôt comme ça… ») et il propose une nouvelle carte.

### Règles et cas limites
- Rien n'est jamais créé sans votre clic, quel que soit le texte que l'agent a lu ou reçu.
- Pas de champ à modifier dans la carte : on corrige en parlant à l'agent.
- Une carte ne peut être confirmée qu'une seule fois : un double clic ne crée pas deux demandes.
- Si la création échoue (connexion perdue…), la carte le dit et le bouton « Créer cette demande » reste disponible pour réessayer.
- Plusieurs cartes peuvent coexister dans une conversation ; chacune se traite séparément.

### Hors périmètre
- Modifier le titre ou le texte directement dans la carte.
- Changer la façon dont l'agent rédige ses propositions, ou le parcours d'une demande après sa création.

### Comment vérifier sur la preview
1. Dans l'onglet « Agent », demandez à l'agent de créer une feature : une carte apparaît avec « Créer cette demande » et « Ignorer », et aucune nouvelle demande n'apparaît au tableau.
2. Cliquez « Ignorer » : la carte affiche « Ignorée », rien n'est créé.
3. Redemandez, puis cliquez « Créer cette demande » : la carte affiche « Créée » avec un lien qui ouvre la nouvelle demande, présente au tableau dans la file.
4. Cliquez « Signaler un bug » en bas du chat, décrivez un bug : une carte apparaît, et le bug ne démarre qu'après votre clic.
5. Laissez une carte sans y toucher, fermez le tableau, rouvrez l'onglet « Agent » : la carte est toujours là, avec ses deux boutons.
