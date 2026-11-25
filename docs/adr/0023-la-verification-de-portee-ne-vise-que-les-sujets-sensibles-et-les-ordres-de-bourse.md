# La vérification de portée ne vise que les sujets sensibles et les ordres de bourse, sans réglage par projet

Le propriétaire demande (#606) qu'avant la relecture finale, un agent neuf cherche ce qu'un changement peut casser en dehors de ce qu'il modifie, et prouve le fait qui le rend sûr en faisant tourner le vrai code ou un test. Il a refusé qu'elle s'applique aux demandes non sensibles, pour ne pas allonger les petites retouches : ne pas proposer de l'étendre à toutes les demandes. Décidé avec lui : elle se fait seulement quand le changement touche à un sujet sensible (la liste de la revue de sécurité : connexion, codes, comptes, données personnelles, argent, partage, suppression de données) ou aux ordres de bourse.

Choix faits en connaissance de cause :

- Sur Pulsar Wheel, seulement les changements qui touchent aux ordres de bourse (ce qui envoie, modifie ou annule un ordre, et ce qui décide de ce qui est envoyé), pas toutes les demandes : ses retouches ordinaires ne sont pas allongées. L'agent en juge sur ce que le changement modifie réellement, pas sur le titre de la demande.
- La règle vaut pour tous les projets et se déclenche dès qu'un changement touche à des ordres. Désigner Pulsar Wheel par un réglage par projet a été écarté : aucun réglage n'est ajouté au tableau de bord.
- Une demande dont la fiche est validée seulement parce qu'elle change le design ou la vision du produit n'est pas concernée.
- Elle se fait aussi pour une correction de bug qui touche aux mêmes sujets, alors que la revue de sécurité ne concerne que les features : une correction de bug est intégrée sans recette du propriétaire, c'est là qu'elle protège le plus.
- Elle est refaite après une correction demandée en recette qui modifie le code, pour que la ligne « Portée vérifiée » dise toujours vrai ; pas après une retouche des captures ni après une correction des contrôles automatiques.
- Pas de vérification de portée pendant une review générale, une amélioration UI ou le socle d'un nouveau projet.
- Elle reste une consigne, comme la revue de sécurité : un contrôle automatique qui refuserait une modification sans la ligne « Portée vérifiée » a été écarté.
- L'idée vient du skill « blast-radius » de pstack ; pstack lui-même n'est pas installé (voir 0022).
