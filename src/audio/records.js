// The crate: classical recordings that are in the public domain. The audio lives in records/ as MP3.
// Picking a record fetches its tracks, cuts them into a groove, and presses the disc.
// `source` is the Wikimedia Commons page each file came from; `licence` is what it says there.
const commons = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
const PD = 'Public domain';

export const RECORDS = [
  {
    id: 'clair', genre: 'Impressionist', title: 'Clair de lune', artist: 'Debussy · Satie', year: 1890, cat: 'SB-3001',
    condition: 'good', seed: 11, art: { style: 'horizon', bg: '#0f2f4f', ink: '#f0efe6', accent: '#9ad1d4' }, label: { paper: '#e9e4d4', ink: '#0f2f4f' },
    tracks: [
      { file: 'clair-de-lune.mp3', title: 'Clair de lune', by: 'Debussy · Laurens Goedhart, piano (2011)', licence: PD, source: commons('Clair de lune (Claude Debussy) Suite bergamasque.ogg') },
      { file: 'gymnopedie-1.mp3', title: 'Gymnopédie No. 1', by: 'Satie · Robin Alciatore, piano, for Musopen', licence: PD, source: commons('Erik Satie - gymnopedies - la 1 ere. lent et douloureux.ogg') },
    ],
  },
  {
    id: 'peergynt', genre: 'Orchestral', title: 'Peer Gynt Suite No. 1', artist: 'Grieg · Musopen Symphony', year: 1875, cat: 'SB-3002',
    condition: 'mint', seed: 23, art: { style: 'peaks', bg: '#f2e3c6', ink: '#27323f', accent: '#d96c3f' }, label: { paper: '#27323f', ink: '#f2e3c6' },
    tracks: [
      { file: 'morning-mood.mp3', title: 'Morning Mood', by: 'Grieg · Musopen Symphony (2012)', licence: PD, source: commons('Grieg - Peer Gynt Suite No. 1, Op. 46 - I. Morning Mood (Musopen Symphony).flac') },
      { file: 'mountain-king.mp3', title: 'In the Hall of the Mountain King', by: 'Grieg · Musopen Symphony (2012)', licence: PD, source: commons('Musopen - In the Hall Of The Mountain King.ogg') },
    ],
  },
  {
    id: 'moonlight', genre: 'Piano', title: 'Moonlight Sonata', artist: 'Beethoven · Bach', year: 1801, cat: 'SB-3003',
    condition: 'good', seed: 31, art: { style: 'rings', bg: '#1b2238', ink: '#e8e2d0', accent: '#c9a14a' }, label: { paper: '#1b2238', ink: '#e8e2d0' },
    tracks: [
      { file: 'moonlight-sonata.mp3', title: 'Moonlight Sonata: Adagio sostenuto', by: 'Beethoven · Paul Pitman, piano, for Musopen', licence: PD, source: commons("Ludwig van Beethoven - sonata no. 14 in c sharp minor 'moonlight', op. 27 no. 2 - i. adagio sostenuto.ogg") },
      { file: 'air.mp3', title: 'Air on the G String', by: 'Bach · Air Force Strings, United States Air Force Band (2000)', licence: PD, source: commons('Air - Air Force Strings - United States Air Force Band.mp3') },
    ],
  },
  {
    id: 'fifth', genre: 'Symphony', title: 'Symphony No. 5', artist: 'Beethoven · Fulda Symphonic Orchestra', year: 1808, cat: 'SB-3004',
    condition: 'played', seed: 47, art: { style: 'bolt', bg: '#141414', ink: '#ffd23f', accent: '#b3201a' }, label: { paper: '#b3201a', ink: '#f5ead0' },
    tracks: [
      { file: 'symphony-5.mp3', title: 'Symphony No. 5: Allegro con brio', by: 'Beethoven · Fulda Symphonic Orchestra, Simon Schindler (2002)', licence: PD, source: commons('Ludwig van Beethoven - Symphonie 5 c-moll - 1. Allegro con brio.ogg') },
    ],
  },
  {
    id: 'chopin', genre: 'Romantic', title: 'Nocturnes & Waltzes', artist: 'Chopin', year: 1832, cat: 'SB-3005',
    condition: 'good', seed: 5, art: { style: 'stars', bg: '#1a1b3a', ink: '#f0e9d8', accent: '#f2d27a' }, label: { paper: '#f0e9d8', ink: '#1a1b3a' },
    tracks: [
      { file: 'nocturne-op9-2.mp3', title: 'Nocturne in E-flat, Op. 9 No. 2', by: 'Chopin · Frank Lévy, piano, for Musopen', licence: PD, source: commons('Chopin - Nocturne No. 2 in E-flat major, Op. 9 No. 2 (Frank Levy).flac') },
      { file: 'waltz-op64-2.mp3', title: 'Waltz in C-sharp minor, Op. 64 No. 2', by: 'Chopin · piano, Wikimedia Commons', licence: 'CC0', source: commons('Chopin-waltz-op-64-no-2-in-c-sharp-minor.oga') },
    ],
  },
  {
    id: 'bach', genre: 'Baroque', title: 'Toccata and Fugue', artist: 'J. S. Bach', year: 1707, cat: 'SB-3006',
    condition: 'played', seed: 61, art: { style: 'pipes', bg: '#efe6d0', ink: '#3a2a1c', accent: '#a8792e' }, label: { paper: '#3a2a1c', ink: '#efe6d0' },
    tracks: [
      { file: 'toccata-fugue.mp3', title: 'Toccata and Fugue in D minor, BWV 565', by: 'Bach · Ashtar Moïra, organ (2006)', licence: PD, source: commons('Toccata et Fugue BWV565.ogg') },
    ],
  },
  {
    id: 'mozart', genre: 'Classical', title: 'Eine kleine Nachtmusik', artist: 'Mozart', year: 1787, cat: 'SB-3007',
    condition: 'mint', seed: 73, art: { style: 'burst', bg: '#f7ecd2', ink: '#7a1f2b', accent: '#e9b949' }, label: { paper: '#7a1f2b', ink: '#f7ecd2' },
    tracks: [
      { file: 'nachtmusik-allegro.mp3', title: 'Eine kleine Nachtmusik: Allegro', by: 'Mozart · string ensemble, via the European Archive', licence: PD, source: commons('Mozart K525 Serenade in G Major 1 - Allegro.ogg') },
      { file: 'rondo-alla-turca.mp3', title: 'Rondo alla Turca', by: 'Mozart · piano, Wikimedia Commons', licence: PD, source: commons('Rondo Alla Turka.ogg') },
    ],
  },
  {
    id: 'tchaikovsky', genre: 'Ballet', title: 'Waltz of the Flowers', artist: 'Tchaikovsky · U.S. Army Band', year: 1892, cat: 'SB-3008',
    condition: 'good', seed: 83, art: { style: 'petals', bg: '#f6dfe3', ink: '#7b2d4b', accent: '#d9607e' }, label: { paper: '#7b2d4b', ink: '#f6dfe3' },
    tracks: [
      { file: 'waltz-of-the-flowers.mp3', title: 'Waltz of the Flowers', by: 'Tchaikovsky · The U.S. Army Band (2019)', licence: PD, source: commons("P.I. Tchaikovsky's Waltz of the Flowers Performed by The U.S. Army Band, c. 2019.mp3") },
    ],
  },
];

export const CUSTOM = {
  id: 'custom', genre: 'Dubplate', title: 'Your Record', artist: 'Cut to order', year: new Date().getFullYear(), cat: 'SB-DUB',
  condition: 'good', seed: 77, art: { style: 'dub', bg: '#111111', ink: '#f4f1e8', accent: '#e63946' }, label: { paper: '#f4f1e8', ink: '#111111' },
  tracks: [],
};
