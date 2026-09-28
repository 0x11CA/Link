/** Simple integer math challenges for earning a free guided hint. */

export type MathOp = "+" | "-" | "×" | "÷";

export type MathChallenge = {
  prompt: string;
  answer: number;
};

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function createMathChallenge(): MathChallenge {
  const ops: MathOp[] = ["+", "-", "×", "÷"];
  const op = ops[randInt(0, ops.length - 1)]!;

  switch (op) {
    case "+": {
      const a = randInt(2, 20);
      const b = randInt(2, 20);
      return { prompt: `${a} + ${b}`, answer: a + b };
    }
    case "-": {
      const a = randInt(5, 30);
      const b = randInt(1, a);
      return { prompt: `${a} − ${b}`, answer: a - b };
    }
    case "×": {
      const a = randInt(2, 12);
      const b = randInt(2, 10);
      return { prompt: `${a} × ${b}`, answer: a * b };
    }
    case "÷": {
      const b = randInt(2, 10);
      const answer = randInt(2, 12);
      const a = b * answer;
      return { prompt: `${a} ÷ ${b}`, answer };
    }
  }
}
