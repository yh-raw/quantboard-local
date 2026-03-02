-- CreateTable
CREATE TABLE "AlertSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT,
    "signalType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "signalTs" DATETIME NOT NULL,
    "signalPrice" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AlertSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AlertSubscription_userId_isActive_ticker_idx" ON "AlertSubscription"("userId", "isActive", "ticker");

-- CreateIndex
CREATE INDEX "AlertDelivery_subscriptionId_sentAt_idx" ON "AlertDelivery"("subscriptionId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_subscriptionId_signalType_signalTs_key" ON "AlertDelivery"("subscriptionId", "signalType", "signalTs");
