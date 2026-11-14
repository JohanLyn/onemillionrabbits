// PLACEHOLDER: replaced by the real minigame. Follows the contract in index.js.
import { C, lawn, text } from './kit.js';

export default {
  id: 'catch',
  name: 'Carrot Catch',
  emoji: '🧺',
  blurb: 'Catch the falling carrots.',
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
        text(g, 'Coming soon: Carrot Catch', api.W / 2, api.H / 2, 28, C.white);
      },
    };
  },
};
