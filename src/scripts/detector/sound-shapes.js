// Sound shapes for the simulations: dB above the room, one value per 50 ms frame.
export const SHAPES = {
  soft: [17, 18, 17, 15.5, 13, 9, 5, 2],
  big: [27, 29, 28.5, 27, 24, 19, 13, 7, 3],
  door: [26, 5, 1.5],
  steps: [9, 3, 0, 0, 0, 0, 0, 0, 9.5, 3, 0, 0, 0, 0, 0, 0, 8.5, 2.5, 0, 0, 0, 0, 0, 0, 9, 3],
};

export const SHAPE_LABELS = { soft: "Soft bark", big: "Big bark", door: "Door slam", steps: "Footsteps", tv: "TV on" };
