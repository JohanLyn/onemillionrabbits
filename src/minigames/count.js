// PLACEHOLDER: replaced by the real minigame. Follows the contract in index.js.
import { C, lawn, text } from './kit.js';

export default {
  id: 'count',
  name: 'Count the Horde',
  emoji: '🔢',
  blurb: 'How many rabbits was that?.',
  how: { touch: 'Tap anywhere.', keys: 'Press space.' },
  duration: 10,
  stars: [3, 6, 9],
  unit: 'taps',
  create(api) {
    return {
      score: 0,
      finished: false,
      down() {
        this.score++;
      },
      key(k) {
        if (k === ' ') this.score++;
      },
      draw(g) {
        lawn(g, api.W, api.H);
        text(g, 'Coming soon: Count the Horde', api.W / 2, api.H / 2, 28, C.white);
      },
    };
  },
};
