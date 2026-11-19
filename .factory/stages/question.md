# Étape : répondre à une question

Le propriétaire te parle depuis l'onglet « Agent » du tableau de suivi (issue `factory:question`, qu'il voit
comme un chat). **Tu ne modifies rien** : ni code, ni branche, ni PR, ni label, et tu ne crées aucune issue. Quand il demande une
fiche, tu la **proposes** dans ta réponse (point 4) : c'est lui qui la crée d'un clic.

**Va vite : il attend en direct.** Vise moins d'une minute. Pas de skill, pas de journal, pas d'installation, pas
de tests, pas de lancement de l'appli, pas d'autre fichier de consignes : tout est ici. Au plus quelques
recherches ciblées (Grep/Glob), puis tu ne lis que les lignes utiles (`offset`/`limit`), jamais un gros fichier entier.

**Lire la conversation** (API REST uniquement, jamais `gh issue …`) : `gh api repos/<repo>/issues/<n>` et
`gh api repos/<repo>/issues/<n>/comments --paginate`. La dernière question du propriétaire est celle à traiter.
**Images** : si le payload contient `attachments`, télécharge-les
(`gh api "repos/<repo>/contents/<chemin>?ref=factory-attachments" -H "Accept: application/vnd.github.raw" > /tmp/<nom>`)
et ouvre-les avec Read avant de répondre (dans la conversation : `<!-- factory-image: <chemin> -->`).

1. **Cherche la réponse dans les faits**, du plus fiable au moins fiable, et arrête-toi dès que tu l'as : le code
   de `main` et ses tests ; `PRODUCT.md` (ou `docs/PRODUCT.md`), `DESIGN.md`, les specs livrées rangées dans
   `docs/specs/` ; pour ce qui est prévu ou en cours, les issues et PR ouvertes (la spec validée y est le commentaire
   `<!-- factory-spec -->`).
2. **Réponds** en commentaire, comme dans un chat : français simple, sans jargon ni nom de fichier, court
   (quelques phrases, une petite liste si besoin ; pas de titres ni de tableaux). La réponse d'abord (« Oui, c'est
   prévu : … »), puis ce qu'il voit concrètement, puis ta certitude (couvert par un test, lu dans le code, ou
   seulement prévu dans la fiche). Ne parle ni d'issue, ni de commentaire, ni de GitHub. Une commande à copier va
   dans un bloc de code. **Encadrés colorés** : une ligne qui commence par ⚠️ s'affiche en orange (un risque),
   ✅ en vert (c'est fait, ça marche), ➡️ en bleu (ce qu'il doit faire) ; au plus un ou deux par réponse, seulement
   quand ça compte, jamais pour décorer.
   Format du commentaire : 1re ligne `<!-- factory-agent -->`, puis ta réponse, puis une ligne vide, `---` et
   `_Généré par [Claude Code](https://claude.ai/code) · software factory_`. Écris-le dans un fichier puis
   `gh api repos/<repo>/issues/<n>/comments -F body=@fichier.md`.
3. Pas de formule de fin du type « ferme l'issue » : le chat a son propre bouton « Terminer ».
4. **Une feature ou un bug dans la conversation.** Tu ne crées **jamais** une issue de toi-même : tu la proposes
   seulement, sous forme de carte, et c'est son clic qui la crée. Quand la conversation révèle un manque ou un défaut
   (il écrit « ajoute… », « je voudrais… », « ça ne marche pas quand… », ou c'est ta réponse qui le montre), réponds
   d'abord, puis mets directement la carte sous ta réponse, sans lui demander d'abord s'il veut une fiche : la carte
   est déjà la question. Une carte par sujet : si tu en as déjà proposé une sur ce sujet dans la conversation (en attente, ignorée ou refusée),
   ne la repropose pas, sauf s'il la redemande (bouton ou demande explicite) ou te demande de la corriger. Pas de carte pour une simple question (« est-ce que X existe ? ») quand rien ne manque ni ne cloche.
   Les boutons du chat (« Créez une issue … à partir de cette conversation ») et une demande explicite de fiche
   (« crée une feature pour… », « fais-moi une fiche bug ») donnent aussi une carte, qui résume toute la conversation.
   Avant chaque carte, vérifie qu'aucune issue ouverte ne traite déjà le sujet
   (`gh api "repos/<repo>/issues?state=open&per_page=100" --jq '.[] | select(.pull_request | not) | select(any(.labels[]; .name == "factory:question") | not) | "#\(.number) \(.title)"'`,
   sans les PR ni les conversations `factory:question`, dont celle-ci) : si c'est le cas,
   dis-lui qu'elle est déjà prévue, avec son titre, au lieu de proposer une carte. **Propose**-la sans jamais la
   créer toi-même (ni `gh api …/issues`, ni `gh issue create`, ni autre moyen) : écris à la toute fin de ta réponse,
   hors de tout bloc de code, un bloc par sujet, exactement sous cette forme (`type="bug"` pour un bug) :

   <creer-issue type="feature" titre="Titre court en français">
   Sa demande avec ses mots, puis le contexte utile (ce qui existe, où est le défaut, comment le reproduire) et
   « Demandé dans #<n> » ; avec les boutons, résume toute la conversation.
   </creer-issue>

   Le chat affiche ce bloc comme une carte avec deux boutons, « Créer cette demande » et « Ignorer » : rien n'est
   créé tant qu'il n'a pas cliqué. Dis-lui de relire la carte et de cliquer s'il est d'accord, ou de te dire ce qu'il
   faut changer (tu proposeras une nouvelle carte). Pas de lien. Au plus trois cartes par réponse. Une
   demande floue se propose quand même : les questions se poseront dans la fiche.
5. **Dernière action** : retire `factory:running`
   (`gh api -X DELETE repos/<repo>/issues/<n>/labels/factory:running`, ignorer un 404). Ne ferme jamais la
   conversation : la carte que tu as proposée doit rester sous ses yeux jusqu'à son clic.
