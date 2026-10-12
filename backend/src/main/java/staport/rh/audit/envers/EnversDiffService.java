package staport.rh.audit.envers;

import jakarta.persistence.EntityManager;
import jakarta.persistence.metamodel.Attribute;
import jakarta.persistence.metamodel.EntityType;
import jakarta.persistence.metamodel.SingularAttribute;
import org.hibernate.envers.Audited;
import org.hibernate.envers.AuditReader;
import org.hibernate.envers.AuditReaderFactory;
import org.hibernate.envers.NotAudited;
import org.hibernate.envers.RevisionType;
import org.hibernate.envers.query.AuditEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;
import staport.rh.audit.dtos.response.AuditChampDto;
import staport.rh.audit.dtos.response.AuditChangementDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.entities.AuditRevision;
import staport.rh.audit.exceptions.UnknownAuditEntityException;

import java.lang.reflect.AnnotatedElement;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Calcule, à la demande, les différences avant / après d'une révision et l'historique d'un enregistrement, à partir
 * des instantanés d'Envers (conventions/audit.md, « Détail des modifications ») — jamais stockées, jamais comparées à la
 * main dans un aspect. Ajout : valeurs après ; modification : comparaison avec la version précédente ; suppression :
 * valeurs avant (conservées grâce à {@code store_data_at_delete}).
 *
 * <p>Les relations simples sont comparées sur l'identifiant de leur cible et rendues {@code "<id> — <libellé>"}
 * ({@link AuditLabelResolver}) ; les collections de droits comme des ensembles d'identifiants (éléments ajoutés et
 * retirés). Un champ {@code @NotAudited} n'apparaît jamais. Une erreur de lecture d'un champ ne fait jamais échouer la
 * consultation : le champ est simplement omis.
 */
@Component
public class EnversDiffService {

    private static final Logger log = LoggerFactory.getLogger(EnversDiffService.class);

    static final String AJOUT = "AJOUT";
    static final String MODIFICATION = "MODIFICATION";
    static final String SUPPRESSION = "SUPPRESSION";

    private final EntityManager entityManager;
    private final AuditLabelResolver libelles;

    public EnversDiffService(EntityManager entityManager, AuditLabelResolver libelles) {
        this.entityManager = entityManager;
        this.libelles = libelles;
    }

    /** Entité auditée désignée par son nom (insensible à la casse), ex. {@code paie}, {@code employee}. */
    public Class<?> classeAuditee(String nomEntite) {
        return entityManager.getMetamodel().getEntities().stream()
                .filter(type -> type.getJavaType().isAnnotationPresent(Audited.class))
                .filter(type -> type.getName().equalsIgnoreCase(nomEntite))
                .map(EntityType::getJavaType)
                .findFirst()
                .<Class<?>>map(classe -> classe)
                .orElseThrow(() -> new UnknownAuditEntityException(nomEntite));
    }

    /** Les changements produits par ces révisions, paginés (une suppression en groupe de mille lignes produit mille éléments). */
    public Page<AuditChangementDto> changements(Collection<Long> revisions, Pageable pageable) {
        if (revisions.isEmpty()) {
            return Page.empty(pageable);
        }
        AuditReader lecteur = AuditReaderFactory.get(entityManager);
        long total = 0;
        long aIgnorer = pageable.getOffset();
        int restant = pageable.getPageSize();
        List<AuditChangementDto> contenu = new ArrayList<>();

        for (Class<?> type : typesModifies(revisions)) {
            long nombre = compter(lecteur, type, revisions);
            total += nombre;
            if (restant <= 0) {
                continue;
            }
            if (aIgnorer >= nombre) {
                aIgnorer -= nombre;
                continue;
            }
            List<?> lignes = lecteur.createQuery().forRevisionsOfEntity(type, false, true)
                    .add(AuditEntity.revisionNumber().in(revisions))
                    .addOrder(AuditEntity.id().asc())
                    .addOrder(AuditEntity.revisionNumber().asc())
                    .setFirstResult((int) aIgnorer)
                    .setMaxResults(restant)
                    .getResultList();
            for (Object ligne : lignes) {
                contenu.add(versChangement(lecteur, type, (Object[]) ligne));
            }
            restant -= lignes.size();
            aIgnorer = 0;
        }
        return new PageImpl<>(contenu, pageable, total);
    }

    /** Toutes les versions d'un enregistrement, de la plus récente à la plus ancienne, chacune avec ce qu'elle a changé. */
    public Page<AuditVersionDto> historique(Class<?> classe, Long id, Pageable pageable) {
        AuditReader lecteur = AuditReaderFactory.get(entityManager);
        long total = ((Number) lecteur.createQuery().forRevisionsOfEntity(classe, false, true)
                .add(AuditEntity.id().eq(id))
                .addProjection(AuditEntity.id().count())
                .getSingleResult()).longValue();
        if (pageable.getOffset() >= total) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        // Une version plus ancienne supplémentaire suffit à calculer le diff de la dernière ligne
        // de la page ; toute la chronologie n'a pas à résider en mémoire.
        List<?> lignes = lecteur.createQuery().forRevisionsOfEntity(classe, false, true)
                .add(AuditEntity.id().eq(id))
                .addOrder(AuditEntity.revisionNumber().desc())
                .setFirstResult(Math.toIntExact(pageable.getOffset()))
                .setMaxResults(Math.addExact(pageable.getPageSize(), 1))
                .getResultList();

        int taillePage = Math.min(pageable.getPageSize(), lignes.size());
        List<AuditVersionDto> versions = new ArrayList<>(taillePage);
        for (int index = 0; index < taillePage; index++) {
            Object ligne = lignes.get(index);
            Object[] triplet = (Object[]) ligne;
            Object entite = triplet[0];
            AuditRevision revision = (AuditRevision) triplet[1];
            RevisionType type = (RevisionType) triplet[2];
            Object precedente = index + 1 < lignes.size() ? ((Object[]) lignes.get(index + 1))[0] : null;
            versions.add(new AuditVersionDto(revision.getId(), revision.getHorodatage(), revision.getUtilisateurId(),
                    revision.getUtilisateurNom(), revision.getOrigine(), revision.getRequestId(), operation(type),
                    champs(classe, type, precedente, entite)));
        }
        return new PageImpl<>(versions, pageable, total);
    }

    private AuditChangementDto versChangement(AuditReader lecteur, Class<?> classe, Object[] ligne) {
        Object entite = ligne[0];
        AuditRevision revision = (AuditRevision) ligne[1];
        RevisionType type = (RevisionType) ligne[2];
        Object precedente = type == RevisionType.MOD ? versionAvant(lecteur, classe, identifiant(entite), revision.getId()) : null;
        return new AuditChangementDto(classe.getSimpleName(), identifiant(entite), libelles.libelleSeul(entite), operation(type),
                champs(classe, type, precedente, entite));
    }

    private Object versionAvant(AuditReader lecteur, Class<?> classe, Long id, Long revision) {
        List<?> versions = lecteur.createQuery().forRevisionsOfEntity(classe, true, true)
                .add(AuditEntity.id().eq(id))
                .add(AuditEntity.revisionNumber().lt(revision))
                .addOrder(AuditEntity.revisionNumber().desc())
                .setMaxResults(1)
                .getResultList();
        return versions.isEmpty() ? null : versions.get(0);
    }

    private long compter(AuditReader lecteur, Class<?> classe, Collection<Long> revisions) {
        Object nombre = lecteur.createQuery().forRevisionsOfEntity(classe, true, true)
                .add(AuditEntity.revisionNumber().in(revisions))
                .addProjection(AuditEntity.id().count())
                .getSingleResult();
        return ((Number) nombre).longValue();
    }

    private List<Class<?>> typesModifies(Collection<Long> revisions) {
        List<String> noms = entityManager.createQuery(
                        "SELECT DISTINCT e FROM AuditRevision r JOIN r.entites e WHERE r.id IN :ids", String.class)
                .setParameter("ids", revisions)
                .getResultList();
        List<Class<?>> types = new ArrayList<>();
        for (EntityType<?> type : entityManager.getMetamodel().getEntities()) {
            if (type.getJavaType().isAnnotationPresent(Audited.class) && noms.contains(type.getJavaType().getName())) {
                types.add(type.getJavaType());
            }
        }
        types.sort(Comparator.comparing(Class::getSimpleName));
        return types;
    }

    private static String operation(RevisionType type) {
        return switch (type) {
            case ADD -> AJOUT;
            case MOD -> MODIFICATION;
            case DEL -> SUPPRESSION;
        };
    }

    // --- différences champ par champ ---

    private List<AuditChampDto> champs(Class<?> classe, RevisionType type, Object avant, Object apres) {
        List<AuditChampDto> champs = new ArrayList<>();
        BeanWrapper bean = apres == null ? null : new BeanWrapperImpl(apres);
        BeanWrapper beanAvant = avant == null ? null : new BeanWrapperImpl(avant);
        for (Attribute<?, ?> attribut : attributsAudites(classe)) {
            try {
                if (attribut.isCollection()) {
                    ajouterCollection(champs, attribut.getName(), type, beanAvant, bean);
                } else {
                    ajouterValeur(champs, attribut, type, beanAvant, bean);
                }
            } catch (RuntimeException e) {
                log.warn("Champ illisible dans l'audit : {}.{}", classe.getSimpleName(), attribut.getName(), e);
            }
        }
        return champs;
    }

    private void ajouterValeur(List<AuditChampDto> champs, Attribute<?, ?> attribut, RevisionType type, BeanWrapper avant, BeanWrapper apres) {
        boolean association = attribut.isAssociation();
        String valeurApres = formater(apres, attribut.getName(), association);
        if (type == RevisionType.DEL) {
            // La version de suppression porte les valeurs de la ligne supprimée : ce sont les valeurs « avant ».
            if (valeurApres != null) {
                champs.add(AuditChampDto.valeur(attribut.getName(), valeurApres, null));
            }
            return;
        }
        String valeurAvant = formater(avant, attribut.getName(), association);
        if (!java.util.Objects.equals(valeurAvant, valeurApres)) {
            champs.add(AuditChampDto.valeur(attribut.getName(), valeurAvant, valeurApres));
        }
    }

    private void ajouterCollection(List<AuditChampDto> champs, String nom, RevisionType type, BeanWrapper avant, BeanWrapper apres) {
        Map<String, String> ensembleApres = type == RevisionType.DEL ? Map.of() : elements(apres, nom);
        Map<String, String> ensembleAvant = type == RevisionType.DEL ? elements(apres, nom) : elements(avant, nom);
        List<String> ajoutes = new ArrayList<>();
        List<String> retires = new ArrayList<>();
        ensembleApres.forEach((id, libelle) -> {
            if (!ensembleAvant.containsKey(id)) {
                ajoutes.add(libelle);
            }
        });
        ensembleAvant.forEach((id, libelle) -> {
            if (!ensembleApres.containsKey(id)) {
                retires.add(libelle);
            }
        });
        if (!ajoutes.isEmpty() || !retires.isEmpty()) {
            champs.add(AuditChampDto.collection(nom, ajoutes.stream().sorted().toList(), retires.stream().sorted().toList()));
        }
    }

    /** Les éléments d'une collection, par identifiant : on compare des ensembles d'identifiants, pas des libellés. */
    private Map<String, String> elements(BeanWrapper bean, String nom) {
        Map<String, String> elements = new LinkedHashMap<>();
        if (bean == null || !(bean.getPropertyValue(nom) instanceof Collection<?> collection)) {
            return elements;
        }
        for (Object element : collection) {
            String rendu = libelles.rendre(element);
            if (rendu != null) {
                elements.put(rendu.contains(" — ") ? rendu.substring(0, rendu.indexOf(" — ")) : rendu, rendu);
            }
        }
        return elements;
    }

    private String formater(BeanWrapper bean, String nom, boolean association) {
        if (bean == null) {
            return null;
        }
        Object valeur = bean.getPropertyValue(nom);
        if (valeur == null) {
            return null;
        }
        if (association) {
            return libelles.rendre(valeur);
        }
        if (valeur instanceof Boolean booleen) {
            return booleen ? "Oui" : "Non";
        }
        if (valeur instanceof BigDecimal montant) {
            return montant.toPlainString();
        }
        if (valeur instanceof Enum<?> enumeration) {
            return enumeration.name();
        }
        return valeur.toString();
    }

    private List<Attribute<?, ?>> attributsAudites(Class<?> classe) {
        List<Attribute<?, ?>> attributs = new ArrayList<>();
        for (Attribute<?, ?> attribut : entityManager.getMetamodel().entity(classe).getAttributes()) {
            boolean identifiant = attribut instanceof SingularAttribute<?, ?> singulier && (singulier.isId() || singulier.isVersion());
            boolean exclu = attribut.getJavaMember() instanceof AnnotatedElement element && element.isAnnotationPresent(NotAudited.class);
            if (!identifiant && !exclu) {
                attributs.add(attribut);
            }
        }
        attributs.sort(Comparator.comparing(Attribute::getName));
        return attributs;
    }

    private Long identifiant(Object entite) {
        Object id = new BeanWrapperImpl(entite).getPropertyValue("id");
        return id instanceof Number nombre ? nombre.longValue() : null;
    }
}
