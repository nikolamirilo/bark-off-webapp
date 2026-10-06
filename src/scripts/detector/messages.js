// The two recorded messages, and the wording the app uses when it ignores a sound.

export const MESSAGES = { 1: "Hey Max, it is okay. I will be home soon.", 2: "Max, quiet now. Good dog." };

export const REASONS = {
  refractory: { short: "Too close", text: "Ignored. Too close to the sound before it." },
  below_trigger: { short: "Too quiet", text: "Ignored. Not loud enough at this sensitivity." },
  adapted: { short: "New normal", text: "It kept going, so the room level rose to meet it and it stopped counting." },
};
