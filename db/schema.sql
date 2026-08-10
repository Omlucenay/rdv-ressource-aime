-- Tables module famille gamification
CREATE TABLE IF NOT EXISTS familles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  code CHAR(6) UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  famille_id INT NOT NULL,
  prenom VARCHAR(50) NOT NULL,
  avatar VARCHAR(10) NOT NULL DEFAULT '👤',
  couleur VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  role ENUM('parent','enfant') NOT NULL DEFAULT 'enfant',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (famille_id) REFERENCES familles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS taches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  famille_id INT NOT NULL,
  titre VARCHAR(100) NOT NULL,
  points INT NOT NULL,
  icone VARCHAR(10) NOT NULL DEFAULT '⭐',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (famille_id) REFERENCES familles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attributions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  membre_id INT NOT NULL,
  tache_id INT NOT NULL,
  points INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
  FOREIGN KEY (tache_id) REFERENCES taches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prestation_id VARCHAR(50) NOT NULL,
  prestation_titre VARCHAR(100) NOT NULL,
  mode ENUM('cabinet', 'visio', 'telephone') NOT NULL,
  date DATE NOT NULL,
  heure TIME NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telephone VARCHAR(20),
  statut ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
  stripe_session_id VARCHAR(200),
  replace_id INT,
  enfant_prenom VARCHAR(100),
  enfant_age TINYINT,
  manage_token CHAR(32),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);