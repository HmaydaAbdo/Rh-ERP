package staport.rh.common.recherche;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.function.Consumer;
import java.util.function.Function;

/**
 * Parcourt une recherche paginée sans jamais demander une page non bornée.
 * Les imports qui doivent construire un index local utilisent ce chargeur afin
 * de conserver une taille de requête maîtrisée, même lorsque le référentiel grandit.
 */
public final class PageLoader {

    public static final int PAGE_SIZE = 200;

    private PageLoader() {
    }

    public static <T> void forEach(Function<Pageable, Page<T>> search, Consumer<T> consumer) {
        int pageNumber = 0;
        Page<T> page;
        do {
            page = search.apply(PageRequest.of(pageNumber++, PAGE_SIZE));
            page.forEach(consumer);
        } while (page.hasNext());
    }
}
