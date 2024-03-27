import { AtomPlayer } from "./AtomPlayer";
import { ClusterPlayer } from "./ClusterPlayer";

/**
 * ClusterPlayer for any number of AtomPlayers. 
 */
export const SyncPlayer = function SyncPlayer(players: AtomPlayer[]): AtomPlayer {
    return players.reduce((combinedPlayer, player) => new ClusterPlayer(combinedPlayer, player));
} as unknown as new (players: AtomPlayer[]) => AtomPlayer;
