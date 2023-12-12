export class Console {
  /**
   * Print message inside a solid border box
   * @param msg
   */
  public static printSolidBox(msg: string): void {
    Console.printBox([
      '┏', '━',  '┓',
      '┃',  msg, '┃',
      '┗', '━',  '┛',
    ]);
  }

  /**
   * Print message inside a double border box
   * @param msg
   */
  public static printDoubleBox(msg: string): void {
    Console.printBox([
      '╔', '═',  '╗',
      '║',  msg, '║',
      '╚', '═',  '╝',
    ]);
  }

  private static printBox(elements: string[]): void {
    console.log(elements[0] + elements[1].repeat(elements[4].length + 2) + elements[2]);
    console.log(`${elements[3]} ${elements[4]} ${elements[5]}`)
    console.log(elements[6] + elements[7].repeat(elements[4].length + 2) + elements[8]);
  }
}
