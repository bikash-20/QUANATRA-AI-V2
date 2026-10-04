export type AnswerState = 'unanswered' | 'correct' | 'incorrect';

export function getAnswerState(
  option: string,
  correctAnswer: string,
  selectedAnswer: string | null,
): AnswerState {
  if (selectedAnswer === null) return 'unanswered';
  if (option === correctAnswer) return 'correct';
  if (option === selectedAnswer) return 'incorrect';
  return 'unanswered';
}
