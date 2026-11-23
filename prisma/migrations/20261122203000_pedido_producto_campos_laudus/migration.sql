-- AlterTable
ALTER TABLE "Pedido"
  ADD COLUMN     "salesOrderIdLaudus" INTEGER,
  ADD COLUMN     "clienteVATIdLaudus" TEXT,
  ADD COLUMN     "clienteEmailLaudus" TEXT,
  ADD COLUMN     "notasLaudus" TEXT,
  ADD COLUMN     "transportistaLaudus" TEXT,
  ADD COLUMN     "fechaEmisionLaudus" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_salesOrderIdLaudus_key" ON "Pedido"("salesOrderIdLaudus");

-- AlterTable
ALTER TABLE "Producto"
  ADD COLUMN     "itemIdLaudus" INTEGER,
  ADD COLUMN     "precioUnitarioLaudus" DOUBLE PRECISION;
