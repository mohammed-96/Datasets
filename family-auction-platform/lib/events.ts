import "server-only";
import { EventEmitter } from "node:events";

export type AuctionEvent =
  | { type: "bid"; currentPrice: number; endAt: string; alias: string }
  | { type: "extended"; endAt: string }
  | { type: "ended"; winnerAlias: string | null; winningBid: number | null }
  | { type: "suspended" }
  | { type: "heartbeat" };

const globalForEvents = globalThis as unknown as { auctionBus?: EventEmitter };

const bus = globalForEvents.auctionBus ?? new EventEmitter();
bus.setMaxListeners(0);
globalForEvents.auctionBus = bus;

export function emitAuctionEvent(auctionId: string, event: AuctionEvent) {
  bus.emit(auctionId, event);
}

export function subscribeAuction(auctionId: string, listener: (event: AuctionEvent) => void) {
  bus.on(auctionId, listener);
  return () => {
    bus.off(auctionId, listener);
  };
}
