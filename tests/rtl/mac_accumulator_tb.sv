`timescale 1ns/1ps

module mac_accumulator_tb;
  logic clk = 1'b0;
  logic rst = 1'b1;
  logic [7:0] a = '0;
  logic [7:0] b = '0;
  logic accumulate = 1'b0;
  logic [15:0] result;

  mac_demo_top dut (
    .clk(clk),
    .rst(rst),
    .a(a),
    .b(b),
    .accumulate(accumulate),
    .result(result)
  );

  always #5 clk = ~clk;

  task automatic step_and_check(
    input logic [7:0] next_a,
    input logic [7:0] next_b,
    input logic next_accumulate,
    input logic [15:0] expected_result,
    input string label
  );
    begin
      @(negedge clk);
      a = next_a;
      b = next_b;
      accumulate = next_accumulate;
      @(posedge clk);
      #1;
      if (result !== expected_result) begin
        $error("%s: result=%0d expected=%0d", label, result, expected_result);
        $fatal(1);
      end
    end
  endtask

  initial begin
    repeat (2) @(posedge clk);
    #1;
    if (result !== 16'd0) begin
      $error("reset: result=%0d expected=0", result);
      $fatal(1);
    end

    @(negedge clk);
    rst = 1'b0;

    step_and_check(8'd2, 8'd3, 1'b0, 16'd0, "pipeline fill");
    step_and_check(8'd3, 8'd4, 1'b1, 16'd6, "first output");
    step_and_check(8'd1, 8'd5, 1'b1, 16'd18, "accumulate");
    step_and_check(8'd7, 8'd2, 1'b0, 16'd23, "overwrite");
    step_and_check(8'd0, 8'd0, 1'b0, 16'd14, "pipeline drain");

    $display("PASS: mac_accumulator_tb");
    $finish;
  end
endmodule
