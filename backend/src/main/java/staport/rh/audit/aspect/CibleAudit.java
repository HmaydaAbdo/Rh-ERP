package staport.rh.audit.aspect;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;

import java.lang.reflect.Method;

/**
 * Détermine l'identifiant de la cible d'une action (conventions/audit.md) : le paramètre nommé {@code id}, sinon l'
 * {@code id} du résultat (accesseur {@code id()} d'un record ou {@code getId()}), sinon le résultat lui-même s'il est un
 * nombre. Passe par les accesseurs, jamais par les champs.
 */
final class CibleAudit {

    private CibleAudit() {
    }

    static Long identifiant(ProceedingJoinPoint point, Object resultat) {
        MethodSignature signature = (MethodSignature) point.getSignature();
        String[] noms = signature.getParameterNames();
        Object[] arguments = point.getArgs();
        if (noms != null) {
            for (int i = 0; i < noms.length; i++) {
                if ("id".equals(noms[i]) && arguments[i] instanceof Number nombre) {
                    return nombre.longValue();
                }
            }
        }
        return identifiantDuResultat(resultat);
    }

    private static Long identifiantDuResultat(Object resultat) {
        if (resultat == null) {
            return null;
        }
        if (resultat instanceof Number nombre) {
            return nombre.longValue();
        }
        for (String accesseur : new String[]{"id", "getId"}) {
            try {
                Method methode = resultat.getClass().getMethod(accesseur);
                if (methode.invoke(resultat) instanceof Number nombre) {
                    return nombre.longValue();
                }
            } catch (ReflectiveOperationException | RuntimeException e) {
                // pas d'identifiant lisible sur ce résultat : l'entrée n'a simplement pas de cible
            }
        }
        return null;
    }
}
