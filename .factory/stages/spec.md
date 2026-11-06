# Étape : spec

But : une spec fonctionnelle que le propriétaire valide (porte 1).

1. Relis l'issue, tout le grilling et ses remarques éventuelles sur une version précédente de la spec.
2. Charge le skill `to-spec` s'il est installé et rédige la spec **en français**, orientée utilisateur :
   - ce que la feature permet, en une phrase ;
   - les parcours, écran par écran, en langage simple ;
   - les règles et cas limites décidés ;
   - ce qui est hors périmètre ;
   - les critères d'acceptation, sous forme de vérifications qu'il pourra faire lui-même sur la preview.
   Si les questions ont produit des documents (voir `.factory/stages/docs.md`), ajoute la phrase de résumé en français.
3. Publie-la en commentaire, qui commence par `<!-- factory-agent -->` puis `<!-- factory-spec -->` et un
   titre `## Spec (version N)`. Une nouvelle version remplace l'ancienne : ne modifie pas les anciens commentaires.
4. **Faut-il la faire valider ?** Oui si l'étape « validation de chaque spec » est active (voir AGENT.md).
   Sinon, oui seulement si la spec est **sensible** : elle peut faire perdre ou effacer des données, touche à
   l'argent, à la sécurité, aux comptes ou au partage de données personnelles, change la vision ou le design
   validés, ou repose sur une hypothèse importante que le grilling n'a pas confirmée.
   - **À valider** : termine par « Répondez « go » pour lancer la construction, ou dites-moi ce qu'il faut
     changer. » (et, si la validation est désactivée, dis en une phrase pourquoi tu demandes quand même).
   - **Pas à valider** : termine par « Je lance la construction sans attendre votre validation (réglage du
     projet). Si quelque chose ne va pas, écrivez-le ici : j'en tiendrai compte. »
4 bis. **Feature trop grosse pour une seule construction ?** (plusieurs écrans indépendants, ou plus d'une demi-journée
   de travail selon toi) : découpe-la avec le skill `to-tickets` s'il est installé, en tranches qui se livrent et se
   testent chacune seule. Cette issue garde la première tranche (la spec ne décrit qu'elle, avec une ligne « Ensuite : »
   qui liste les autres). Ouvre une issue par autre tranche (voir « Ouvrir une issue » dans AGENT.md, avec `factory:kept` :
   elles viennent de sa demande), dont la description contient sa partie de la spec, `Découpée de #<n>.` et le marqueur
   `<!-- factory-split -->` ; elles partiront en parallèle quand une place se libère.
5. Labels de l'issue : retire `factory:grilling`, ajoute `factory:spec-review`, et aussi `factory:auto-go`
   si la spec n'est pas à valider : la construction démarrera dès la fin de ce run.
