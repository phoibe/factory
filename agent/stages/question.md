# Étape : répondre à une question

Le propriétaire pose une question sur le projet (label `factory:question`) : comment l'appli se comporte dans
tel cas, si tel cas est prévu, ce qui existe déjà, où en est une feature. **Tu ne modifies rien** : ni code,
ni branche, ni PR, ni label, ni autre issue. Tu réponds, c'est tout.

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
4. Si la réponse révèle un manque ou un défaut, ne le corrige pas : propose-le en une phrase et dis-lui
   d'ouvrir une issue « Nouvelle feature » ou « Signaler un bug » s'il le veut (donne le lien
   `https://github.com/<repo>/issues/new/choose`).
5. Termine par : « Tu peux poser une autre question ici, ou fermer l'issue si c'est bon. »
6. Dernière action, comme toujours : retire `factory:running`.
