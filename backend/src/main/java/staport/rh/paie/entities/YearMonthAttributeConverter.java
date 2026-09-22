package staport.rh.paie.entities;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.YearMonth;

/**
 * Stocke une période (année-mois) sous forme d'entier "yyyyMM" (ex. 2026-09 → 202609) :
 * tri et comparaison naturels, aucune ambiguïté de fuseau horaire.
 */
@Converter(autoApply = true)
public class YearMonthAttributeConverter implements AttributeConverter<YearMonth, Integer> {

    @Override
    public Integer convertToDatabaseColumn(YearMonth attribute) {
        return attribute == null ? null : attribute.getYear() * 100 + attribute.getMonthValue();
    }

    @Override
    public YearMonth convertToEntityAttribute(Integer dbData) {
        return dbData == null ? null : YearMonth.of(dbData / 100, dbData % 100);
    }
}
