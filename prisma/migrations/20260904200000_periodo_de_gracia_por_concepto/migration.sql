-- Periodo de gracia configurable por concepto (PRD §11.3, F3-PAG-005).
--
-- No todos los conceptos aguantan lo mismo ante un cobro fallido. Perder el
-- acceso a una herramienta por un cargo rechazado es un fastidio; perder la
-- afiliación sindical mientras el banco resuelve es perder derechos. Por eso el
-- periodo lo fija quien administra el catálogo, concepto por concepto, y no una
-- constante del sistema.
--
-- Nace en cero: cero días de gracia es lo que ya ocurría antes de esta columna,
-- de modo que añadirla no cambia por sí sola el comportamiento de nada.
ALTER TABLE "catalog_product" ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 0;

-- Un periodo negativo adelantaría la pérdida del derecho al momento del fallo,
-- y uno desmedido la volvería perpetua. El límite es de un año.
ALTER TABLE "catalog_product"
  ADD CONSTRAINT "catalog_product_grace_period_range"
  CHECK ("gracePeriodDays" >= 0 AND "gracePeriodDays" <= 365);
