# Étape : correction des contrôles automatiques

Les contrôles automatiques ont échoué sur la PR.

1. Le payload contient `checksRun`, l'identifiant du run en échec : `gh run view <checksRun> --log-failed`.
   (Le dernier commentaire `factory-checks-failed` de la PR contient aussi le lien.)
   **Preview cassée** : si le payload contient `preview` (son adresse) et `previewProblem`, les contrôles étaient verts
   mais la factory a ouvert la preview de la PR comme un visiteur et elle ne marche pas (page vide, erreur dans la
   page, serveur en erreur 500…). Ouvre-la toi-même (skill `webapp-testing` s'il est installé), trouve la cause : souvent
   une variable d'environnement absente chez l'hébergeur, une base pas branchée, une page qui plante sans données.
   Si la cause est un réglage que seul le propriétaire peut faire chez l'hébergeur, n'invente pas de contournement :
   explique-lui le clic exact sur la PR, mets `factory:blocked` sur l'issue et termine.
2. Reproduis l'échec localement, corrige la cause (jamais en désactivant un test ou un contrôle), vérifie, push.
3. Labels de la PR : retire `factory:fixing`, ajoute `factory:checks`.
4. Pas besoin de commenter si tout s'est bien passé.
