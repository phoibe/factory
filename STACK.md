# Stack technique

## Interface
- **Panneau** — la page web où vous suivez vos projets, sur ordinateur et téléphone
- **HTML, CSS et JavaScript** — langages du panneau, exécutés par le navigateur ; **aucun framework**
- **Hébergement : GitHub Pages** — publie le panneau à chaque mise en ligne

## Moteur / serveur
- **Node.js 22** — fait tourner le moteur de la factory (file d'attente, lancement de l'agent, contrôles, mise en ligne) ; **aucun framework**
- **Hébergement : GitHub Actions** — lance le moteur à chaque nouveauté dans vos projets (message, étape qui change, livraison) et toutes les quelques minutes
- **Serveur de dev : runners GitHub Actions auto-hébergés** — votre machine, derrière Tailscale : les tâches de vos projets privés y tournent (2 runners par projet, installés par une seule commande, voir le guide « serveur de dev ») quand elle est connectée, sinon sur les machines GitHub en secours (vérifié toutes les 15 minutes)
- **Claude Code 2.1** — l'agent qui pose les questions, rédige les fiches et construit ; il est lancé par les routines Claude Code dans le cloud, ou par GitHub Actions en secours

## Autres services
- **Discussion en direct** — l'onglet « Agent » du panneau
- **Python 3.12** — langage du petit serveur de discussion
- **FastAPI 0.115** — framework qui reçoit vos messages et renvoie la réponse au fil de l'eau
- **Hébergement : Modal** — fait tourner ce serveur seulement quand vous discutez ; il s'endort après 10 minutes sans message
- **Alertes téléphone : ntfy** — vous prévient quand une demande attend votre réponse

## Données
- **Pas de base de données classique** : tout est stocké dans GitHub.
- **Demandes GitHub et leurs étiquettes** — vos demandes, leurs échanges et l'étape où elles en sont
- **Branches dédiées** — les conversations de la discussion, les images collées, les captures avant/après et l'état du serveur de dev
- **Navigateur** — votre jeton GitHub reste dans le navigateur du panneau, jamais ailleurs

## Bibliothèques
### Pour faire tourner le logiciel
- **httpx 0.28** — permet au serveur de discussion de lire GitHub
- **Modal 1.6** — met en ligne le serveur de discussion
- **QR Code Generator** (copie intégrée au panneau, version non indiquée) — dessine le code à scanner pour ouvrir le panneau sur votre téléphone
- **Geist** (police, copie intégrée au panneau, version non indiquée) — les caractères du panneau
- Le moteur et le panneau n'utilisent aucune autre bibliothèque : seulement ce que Node.js et le navigateur fournissent.
### Pour la fabrication et les tests
- **Playwright 1.56** — pilote un vrai navigateur pour rejouer les parcours du panneau et prendre les captures
- **axe-core 4.10** — vérifie l'accessibilité de base du panneau
- Les tests du moteur utilisent ceux intégrés à Node.js et à Python, sans bibliothèque.

## Services nécessaires
- **GitHub** — garde le code, les demandes et les données, fait tourner le moteur et publie le panneau. Gratuit, compte nécessaire. Le dépôt factory est public : GitHub Actions y est illimité, et GitHub Pages accepte un site de 1 Go et environ 100 Go de trafic par mois.
- **Claude (abonnement)** — fait travailler l'agent et répond dans la discussion. Payant, compte nécessaire. Le nombre de lancements de l'agent par jour dépend de votre abonnement.
- **Modal** — héberge le serveur de discussion en direct. Gratuit, compte nécessaire. Gratuit jusqu'à 30 $ d'usage par mois.
- **ntfy** — envoie les alertes sur votre téléphone. Gratuit, sans compte. Le service public limite le nombre de messages par jour (limite à vérifier), très au-dessus de l'usage de la factory.

## Mise en production
- **Automatique** — chaque merge sur la branche principale publie le panneau sur GitHub Pages (`.github/workflows/pages.yml`) ; vos projets reçoivent la nouvelle version quand la version stable avance
- **Retour arrière** : la factory annule d'elle-même une livraison qui casse le site en ligne
