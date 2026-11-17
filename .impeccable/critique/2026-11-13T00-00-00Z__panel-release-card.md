# Critique — carte « Mise en production » (panel/app.mjs, Suivi)

Mode : Operate. Cible : les nouvelles cartes de mise en production sur le tableau (en cours + Terminé),
clair et sombre, ordinateur et téléphone. Deux évaluations indépendantes (sous-agents Sonnet) + détecteur.

## Score
- Première critique : 7/10 (cohérent avec la famille Factory ; deux points à corriger).
- Après corrections : 8.5/10.

## Points forts
- Même coquille de carte, rayons, échelle typographique que les cartes voisines ; numéros et version en mono.
- L'état est toujours mot + couleur (« En ligne », « – Pas mise en production »), jamais la couleur seule.
- Ordre interne clair : titre, état + date, liste des modifications, version, lien.

## Corrigé
- **Liens en bleu → encre soulignée.** « Voir le site en ligne » et « Voir la correction » étaient en bleu
  signal (réservé à « À vous de jouer »). Repassés au style de lien de la page (encre, souligné), avec une
  zone tactile de 44 px comme les autres liens discrets.
- **Rythme d'espacement** aligné sur 8/16 entre l'état, la liste et la raison.
- **Puces de la liste** en gris discret plutôt qu'en noir plein.

## Points restants (observations mineures, dans le périmètre du design validé)
- Bordure teintée (verte/rouge) des cartes « Terminé » : c'est le style existant des cartes terminées et
  bloquées ; conservé pour rester cohérent, l'état est accompagné d'un mot.
- « En ligne ✅ » : l'émoji est le libellé validé par le propriétaire dans la spec (et déjà dans les messages
  « En production ✅ » qu'il voit sur GitHub) ; conservé pour coller à ce qu'il a validé.

## Détecteur
Aucune nouvelle alerte imputable à cette branche (police Geist et points de discussion animés : préexistants,
fixés par DESIGN.md).

Questions skipped: run autonome de la factory.
