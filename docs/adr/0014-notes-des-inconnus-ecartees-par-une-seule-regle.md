# Une seule règle écarte les notes des inconnus, et leurs demandes sont reprises par copie

Sur un projet public, un inconnu peut écrire dans la description de sa propre demande ou de sa propre modification, et y
glisser de fausses notes de la factory pour lui faire croire qu'une étape est déjà passée. Décidé avec le propriétaire
(#557) : les notes restent là où elles sont, et une seule règle, placée là où passent toutes les lectures de la factory,
ne garde que celles des demandes et modifications ouvertes par le propriétaire, par quelqu'un à qui il a donné le droit
d'écrire dans le projet, ou par la factory ; celles d'un inconnu sont écartées en silence. C'est la règle déjà suivie
pour les messages depuis #339. Déplacer toutes les notes dans un rangement caché à part a été écarté : environ deux fois
plus de travail au cœur de la factory, un tableau obligé de lire GitHub plus souvent, et la règle serait restée
nécessaire pour les notes qui disent ce qu'est une demande (une idée de l'agent, une tranche d'une feature découpée).

La factory ne travaille pas non plus dans la demande d'un inconnu, car il peut en changer le texte après le « go » du
propriétaire. Quand le propriétaire veut la reprendre, elle en ouvre une copie pour lui (le texte tel qu'il était à ce
moment-là, son message, un lien vers l'originale), travaille dans cette copie, puis ferme l'originale avec un mot. Le
propriétaire aurait pu choisir plus simple (un message lui demandant de recréer la demande lui-même) : il a préféré la
copie, qui lui laisse le même geste qu'avant.
