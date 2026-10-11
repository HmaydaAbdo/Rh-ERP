package staport.rh.common;

import staport.rh.common.exception.ConflitModificationException;

import java.util.Objects;

/** Vérifie la version lue par le client avant qu'un service applique ses modifications. */
public final class VersionOptimiste {

    private VersionOptimiste() {
    }

    public static void verifier(Long versionAttendue, Long versionCourante) {
        if (!Objects.equals(versionAttendue, versionCourante)) {
            throw new ConflitModificationException();
        }
    }
}
