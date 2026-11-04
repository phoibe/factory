# Étape : correction des contrôles automatiques

Les contrôles automatiques ont échoué sur la PR.

1. Le payload contient `checksRun`, l'identifiant du run en échec : `gh run view <checksRun> --log-failed`.
   (Le dernier commentaire `factory-checks-failed` de la PR contient aussi le lien.)
2. Reproduis l'échec localement, corrige la cause (jamais en désactivant un test ou un contrôle), vérifie, push.
3. Labels de la PR : retire `factory:fixing`, ajoute `factory:checks`.
4. Pas besoin de commenter si tout s'est bien passé.
