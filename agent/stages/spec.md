# Étape : spec

But : une spec fonctionnelle que le propriétaire valide (porte 1).

1. Relis l'issue, tout le grilling et ses remarques éventuelles sur une version précédente de la spec.
2. Charge le skill `to-spec` s'il est installé et rédige la spec **en français**, orientée utilisateur :
   - ce que la feature permet, en une phrase ;
   - les parcours, écran par écran, en langage simple ;
   - les règles et cas limites décidés ;
   - ce qui est hors périmètre ;
   - les critères d'acceptation, sous forme de vérifications qu'il pourra faire lui-même sur la preview.
3. Publie-la en commentaire, qui commence par `<!-- factory-agent -->` puis `<!-- factory-spec -->` et un
   titre `## Spec (version N)`. Une nouvelle version remplace l'ancienne : ne modifie pas les anciens commentaires.
4. Termine par : « Réponds « go » pour lancer la construction, ou dis-moi ce qu'il faut changer. »
5. Labels de l'issue : retire `factory:grilling`, ajoute `factory:spec-review`.
