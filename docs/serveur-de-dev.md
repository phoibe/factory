# Serveur de dev : faire tourner les tâches de vos projets privés sur votre machine

Les tâches automatiques de la factory (tri des demandes, vérification toutes les 5 minutes, contrôles, vérification
des aperçus et de la mise en ligne) d'un **projet privé** tournent sur votre serveur de dev quand ses runners sont
connectés à GitHub, et repassent toutes seules sur les machines GitHub quand il est éteint ou déconnecté. Les projets
publics restent toujours sur les machines GitHub (gratuites pour eux).

L'installation des runners sur le serveur fait l'objet d'une demande à part (#274). Ce guide couvre la clé d'accès,
à créer une seule fois.

## 1. Créer la clé d'accès des runners

1. Ouvrez <https://github.com/settings/personal-access-tokens/new>.
2. **Token name** : `factory runners`. **Expiration** : 1 an (la factory vous prévient une semaine avant la fin).
3. **Repository access** : « Only select repositories », puis cochez vos projets privés (pensez à ajouter les
   nouveaux plus tard ; un projet que la clé ne voit pas reste simplement sur les machines GitHub).
4. **Repository permissions** :
   - **Administration** : Read-only (voir si les runners du serveur sont connectés) ;
   - **Variables** : Read and write (noter dans chaque projet « serveur » ou « GitHub ») ;
   - **Actions** : Read and write (relancer sur GitHub les tâches coincées sur le serveur éteint) ;
   - **Contents** : Read-only (lire le réglage de chaque projet) ;
   - « Metadata » est cochée d'office.
5. **Generate token**, puis copiez la clé.

## 2. La ranger dans la factory

Ouvrez <https://github.com/phoibe/factory/settings/secrets/actions>, **New repository secret** :
nom `FACTORY_RUNNERS_TOKEN`, valeur : la clé copiée. C'est tout.

Au plus tard 15 minutes après, le panneau (onglet « Paramètres », section « Machine des tâches ») affiche
« Serveur de dev : en ligne » pour les projets privés dont les runners sont connectés.

## Ce qui se passe ensuite

- Toutes les 15 minutes, la factory demande à GitHub si les runners de chaque projet privé sont connectés (votre
  serveur, derrière Tailscale, n'a rien à ouvrir).
- Serveur éteint ou déconnecté : le projet passe sur les machines GitHub, les tâches coincées sur le serveur sont
  annulées puis relancées sur GitHub, et vous recevez une notification. Il revient sur le serveur, avec une
  notification, dès qu'il est de nouveau connecté.
- Serveur allumé mais occupé : les tâches attendent leur tour sur le serveur.
- Sans clé, clé expirée ou refusée : tout reste sur les machines GitHub, et le panneau affiche « clé d'accès
  manquante ». Une clé qui expire alors qu'un projet est sur le serveur ne peut plus le remettre sur GitHub : d'où
  l'alerte une semaine avant l'expiration.

## Pour la technique

- Le choix est la variable `FACTORY_RUNS_ON` de chaque projet (les étiquettes des runners, en JSON, par défaut
  `["self-hosted"]`), lue par chaque `runs-on` des workflows de la factory. Sans variable : machines GitHub.
- Le réglage général et l'état du dernier contrôle sont sur la branche `factory-runners` de la factory
  (`settings.json`, `status.json`). Les projets y sont désignés par une empreinte, jamais par leur nom.
- Les étiquettes demandées aux runners se changent dans `settings.json` (`"labels": ["self-hosted", "…"]`).
