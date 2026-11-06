function calciWeight(track, recentArtists) {
    const likes = Math.max(0, Number(track.likes ?? 0));
    const dislikes = Math.max(0, Number(track.dislikes ?? 0));
    const totalVotes = likes + dislikes;
    const quality = ( likes + 2) / ( totalVotes + 4 );
    const exp = 1 / Math.sqrt(1 + totalVotes);
    let w = 0.15 + quality + exp * 0.35;
    const artist = String(track.artist ?? '').toLowerCase();
    if (artist && recentArtists.has(artist)) {
        w *= 0.2;
    }
    return Math.max(0.01, w);
}

export function selWeightedTrack(candies, recentArtists = []) {
    if (!candies || candies.length === 0) return null;
    const weighted = candies.map((candy) => ({
        candy, w: calciWeight(candy.track, recentArtists);
    }));
    const total = weighted.reduce((sum, { w }) => sum + w, 0);
    let rand = Math.random() * total;
    for (const i of weighted) {
        rand -= i.w;
        if (rand <= 0) {
            return i.candy;
        }
    }
    return weighted[weighted.length - 1].candy;
}