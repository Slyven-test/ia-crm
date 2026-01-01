# Fonctionnalités manquantes et améliorations à apporter

Ce document recense les éléments qui restent à implémenter pour que
**ia‑crm** atteigne un niveau de complétude comparable à la plateforme
historique CRM iSavigne. Il est basé sur l’analyse du dépôt
`crm‑reco‑platform`, des guides de build et de la documentation
`DOCUMENTATION_COMPLETE_CRM_RUHLMANN_v4_FINALE.docx`. Les points listés
ci‑dessous sont regroupés par thème et classés par priorité.

## 1. API et backend

- **Endpoints ETL** : ajouter `POST /api/etl/ingest` pour déclencher le
  pipeline d’ingestion et `GET /api/etl/state` pour consulter l’état du
  dernier run (date, statut, nombre de fichiers traités).
- **Endpoints CRUD complets** : implémenter la suppression de produits
  (`DELETE /api/products/{id}`) et la création/mise à jour des ventes
  groupées (Orders et OrderItems) pour refléter la structure des
  commandes plutôt que des lignes de vente isolées.
- **Endpoint export** : proposer `GET /api/export/recommendations` et
  `GET /api/export/audit` pour télécharger des CSV ou JSON des
  recommandations générées et des logs d’audit.
- **Endpoint configuration** : exposer des routes pour lire et modifier
  les paramètres de l’algorithme (seuils RFM, poids des scénarios,
  garde‑fous) et sauvegarder ces réglages dans un fichier YAML ou en
  base.
- **Endpoint historique des contacts** : créer des routes pour
  enregistrer et consulter les `ContactEvent` afin de suivre les
  campagnes et d’appliquer la fenêtre de silence.
- **Implémentation complète de `RecoRun` et `RecoItem`** : lors de
  chaque génération, insérer un enregistrement `RecoRun` et les
  `RecoItem` associés avec les métadonnées de version et le score.
- **Validation manuelle avancée** : enrichir `POST /recommendations/approve`
  pour permettre de valider ou rejeter individuellement des
  recommandations, et stocker ce statut dans `RecoItem` ou `Recommendation`.

## 2. Services métier

- **Moteur d’audit complet** : implémenter les 15 règles d’audit
  décrites dans la documentation (silence de 14 jours, e‑mail manquant,
  doublons, fatigue marketing, trop faible diversité, etc.) et
  calculer un score global sur 100 points avec un seuil de gating
  automatique (ex. 80 %).
- **Moteur de recommandation multi‑scénarios** : intégrer les
  scénarios Reb Buy, Cross‑Sell, Up‑Sell, Winback et Nurture
  conformément au guide. Chaque scénario doit appliquer ses propres
  règles de sélection et de pondération (popularité, marge, budget,
  famille CRM, profil aromatique, fréquence d’achat). Les scores
  doivent être normalisés et un classement final produit.
- **Profils aromatiques avancés** : compléter le calcul des profils
  sensoriels avec pondération par montant et fréquence, et gérer
  l’absence d’informations aromatiques via des valeurs par défaut ou
  lissage.
- **Segmentation client et clustering** : développer un service de
  clustering (par exemple K‑means ou DBSCAN) afin d’assigner une étiquette
  `cluster` à chaque client et exposer les résultats via l’API et
  l’interface.
- **Suivi des résultats (outcomes)** : créer un service pour mesurer
  l’efficacité des recommandations et des campagnes (taux d’ouverture,
  clics, conversions) et stocker ces métriques pour un reporting
  ultérieur.

## 3. Front‑end (React)

- **UI complète pour l’ingestion et le catalogue** : ajouter des pages
  permettant de déposer des fichiers, de suivre l’état du pipeline et
  d’éditer le catalogue produit (ajout, modification, suppression,
  import/export).
- **Tableau de bord RFM et segmentation** : proposer une visualisation
  interactive des segments RFM, des clusters et des indicateurs clés
  (clients actifs, churn, panier moyen) avec des filtres temporels.
- **Tableau de bord Audit** : afficher les résultats détaillés de
  l’audit, avec les règles déclenchées, le score global, des graphiques
  et la possibilité de générer un rapport au format CSV ou PDF.
- **Manuel Review Dashboard** : créer une interface dédiée où les
  utilisateurs peuvent examiner les recommandations avant envoi,
  approuver/rejeter et visualiser les raisons (explanations).
- **Gestion des campagnes Brevo** : développer un module UI pour
  sélectionner une audience, choisir un template, planifier l’envoi,
  suivre les statistiques d’envoi et consulter les contacts récents.
- **Interface d’administration** : permettre la modification des
  paramètres système (garde‑fous, poids des scénarios, seuils d’audit,
  segmentation), l’ajout d’alias produits et la gestion des utilisateurs.
- **Internationalisation et accessibilité** : prévoir la traduction
  (FR/EN) et adapter l’interface aux mobiles et tablettes.

## 4. Infrastructure et opérations

- **Intégration Brevo réelle** : remplacer le stub actuel par un client
  API Sendinblue/Brevo pour envoyer des e‑mails, récupérer les
  statistiques (ouvertures, clics, désinscriptions) et gérer les
  listes/segments de contacts.
- **Automatisation de l’ETL** : installer une tâche cron ou un
  ordonnanceur (Celery beat, Airflow) pour exécuter l’ETL chaque
  semaine, détecter automatiquement l’arrivée de nouveaux fichiers et
  envoyer des alertes en cas d’échec.
- **File de tâches (Celery/RQ)** : déporter les opérations lourdes
  (ingestion, calcul RFM, génération de recommandations, envoi
  d’e‑mails) dans une file asynchrone afin de ne pas bloquer le serveur
  web.
- **Sauvegardes et restauration** : mettre en place un système de
  sauvegarde automatisée de la base PostgreSQL et tester la
  restauration complète sur un environnement de pré‑production.
- **Surveillance et logs** : configurer un monitoring (Prometheus,
  Grafana) et une centralisation des logs (ELK) pour détecter les
  anomalies et suivre les performances.
- **Tests et validation** : écrire des tests unitaires et
  d’intégration couvrant les services critiques (RFM, recommandations,
  audit) et mettre en place un pipeline CI/CD pour valider chaque
  changement.

---

Cette liste constitue la feuille de route pour les prochaines itérations.
Chaque fonctionnalité devra être conçue, implémentée, testée et
documentée avant le déploiement final sur le domaine `ia-crm.aubach.fr`.