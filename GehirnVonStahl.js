class Machine {

	constructor() {
		this.E = 0;
        	this.U = 0;
        	this.R = 0;
        	this.S = 1;
		
		this.Crankcount = 0;
		
		// Code:
        	this.History = [];
	}
	
	command(cmd, operand) {
		var c = {
			'command': cmd, 
			'operand': operand
		};
		
		// console.log(c);
		
        	this.History.push(c);
	}

    	list_to_console() {
        	for(c in this.History) {
			if (c.operand !== undefined) {
                		console.log(c.command + ' ' + str(c.operand))
            		} else {
                		console.log(c.command);
			}
		}
	}

    	comment(message) {
		this.command('; ' + message);
	}
	
    	DONE() {
        	this.command('DONE');
		this.comment('Final result after ' + this.Crankcount + ' cranks: R=' + this.R);
    	}
	
    	LOAD(n) {
        	this.command('LOAD', n);        
        	this.E = n;
	}

	LOADCond(n) {
		if (this.E != n) {
			this.LOAD(n);
		}
	}

    	CRANKFWD(repeat) {
        	this.command('CRANKFWD ' + repeat);
        	this.R += repeat * (this.S * this.E);
        	this.U += repeat * this.S;
		this.Crankcount += repeat;
	}

	CRANKFWDCond(repeat) {
		if ((this.E) && repeat) {
			this.CRANKFWD(repeat);
		}
	}

    	CRANKREV(repeat) {
        	this.command('CRANKREV ' + repeat)
        	this.R -= repeat * this.S * this.E
        	this.U -= repeat * this.S * 1
		this.Crankcount += repeat;
	}
	
	CRANKREVCond(repeat) {
		if ((this.E) && repeat) {
			this.CRANKREV(repeat);
		}
	}
	
    	RESETALL() {
        	this.command('RESETALL');
        	this.E = 0;
        	this.U = 0;
        	this.R = 0;
        	this.S = 1;
	}

    	RESETR() {
        	this.command('RESETR');
        	this.R = 0;
	}
	
	RESETRCond() {
		if (this.R) {
			this.RESETR();
		}
	}

    	RESETU() {
        	this.command('RESETU');
        	this.U = 0;
	}

	RESETUCond() {
        	if (this.U) {
			this.RESETU();
		}
	}

    	SCALEUP(repeat = 1) {
        	this.command('SCALEUP ' + repeat);
        	this.S = this.S * 10**repeat;
	}

    	SCALEDWN(repeat = 1) {
        	this.command('SCALEDWN ' + repeat);
        	this.S = Math.trunc(this.S / 10**repeat);
	}
	
	check_operand(node) {
		// node should represent an integer to pass
		if (node.isConstantNode && node.value && (typeof node.value === 'number')) {
			// it's there and it's a number.
			if (node.value % 1 === 0) {
				// it's an integer
				if (node.value<0) {
					throw ('\'' + node.value + '\'? No negative inputs please.');
				}
			} else {
				throw ('\'' + node.value + '\'? I am a fixed-point machine. Please give me integers only, I deal with the value, you with the scale.');
			}
		}
		
		return node.value;
	}
	
	generate_code_BinOp_Add(node) {
		this.comment('Begin Add')

		/*
			Addition is commutative. If any of the operands needs
			to be computed it is preferable to do that first because
			after that computation the result will be in the Resultwerk
			and can be reused directly in place. So in that case
			swap the operands.
		*/
		var first =  node.args[0];
		var second = node.args[1];

		if (first.isConstantNode && !second.isConstantNode) {
			// swap:
			first =  node.args[1];
			second = node.args[0];
		}
	
		// Does the first operand require computation?
		if (!first.isConstantNode) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(first)
			
			// Does the other operand require computation?
			if (!second.isConstantNode) {
				// Yes, we need to compute the second op. 
				
				// Emit code to compute the second.
				this.generate_code(second)
				
				// Now the value of the second operand is in the R-Register.
			} else {
				/*
					No. We have an immediate value for the second operand.
					Leave the first operand in the R-Register, set the
					second from the immediate value in the E-Register
				*/
				this.LOADCond(this.check_operand(second));
			}				
		} else {
			/*
				No. The first operand is an immediate value. The swap above 
				implies that the second is as well. So we can simply load the
				first, set the second and are set up.
			*/
			this.RESETRCond();
			this.LOADCond(this.check_operand(first));
			this.CRANKFWD(1);
			this.LOADCond(this.check_operand(second));
		}
		
		// Do the actual addition
		this.CRANKFWDCond(1)

		this.comment('End Add R=' + this.R);
	}
	
	generate_code_BinOp_Sub(node) {	
		this.comment('Begin Sub')

		var second;

		// Does the second operand require computation?
		if (!node.args[1].isConstantNode) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[1])
			second = this.R;
		} else {
			second = this.check_operand(node.args[1]);
		}

		// Does the first operand require computation?
		if (!node.args[0].isConstantNode) {
			// Yes, we need to compute the first op. Emit code to do that.
			this.generate_code(node.args[0]);
				
			// Now the value of the first operand is in the R-Register.
		} else {

			// No. We have an immediate value for the first operand. Put that
			// into the R-Register
			this.RESETRCond();		
			this.LOADCond(this.check_operand(node.args[0]));
			this.CRANKFWDCond(1);
		}

		// Load the second operand into E.
		this.LOADCond(second);
		
		// Do the actual subtraction
		this.CRANKREVCond(1);

		this.comment('End Sub R=' + this.R);
	}

	generate_code_BinOp_Mult(node) {
		this.comment('Begin Mult')
		
		/*
			For Multiplication we want to start with one operand in
			the E-Register and 0 in the R-Register. The second operand
			we need to have seen to be able to subsequently turn it 
			into the U-Register. So if any of the operands requires
			calculation it is preferable to do that first, since we
			need to reset the R-Register anyway.
		*/
		var first =  node.args[0];
		var second = node.args[1];

		if (first.isConstantNode && !second.isConstantNode) {
			// swap:
			first =  node.args[1];
			second = node.args[0];
		}
	
		var left;
		var right;
		
		// Does the first operand require computation?
		if (!first.isConstantNode) {
			//  Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(first);

			// Store the value of that to later be turned into the U-Register
			left = this.R;

			// Does the other operand require computation?
			if (!second.isConstantNode) {
				// Yes, we need to compute the second op 
				
				this.generate_code(second)
				// Now the value of the second operand is in the R-Register.
				right = this.R;
			} else {
				// No. We have an immediate value for the second operand.
				right = this.check_operand(second)
			}
		} else {
			// No. The first operand is an immediate value. The swap above 
			// implies that the second is as well. So we can simply load them.
			left = this.check_operand(first)
			right = this.check_operand(second)
		}
		
		// Set up the multiplication. First think of which is more work, we want the one which
		// requires more turns in E and the other as U target.
		var digitsum = function(n) {
			var sum = 0;
			while (n) {
				var digit = n % 10;
				sum += digit;
				n = (n - digit) / 10;
			}
			return sum;
		}
		
		var leftdigitsum = digitsum(left);
		var rightdigitsum = digitsum(right);
		
		if (rightdigitsum > leftdigitsum) {
			// swap 
			var t = left;
			left = right;
			right = t;
		}
		
		this.LOADCond(left);
		this.RESETRCond();
		this.RESETUCond();
		
		this.comment('Do Mult ' + left + '*' +  right);

		var s = 0;
		var i = 0;
		// For each digit of the right operand, in reverse. This abomination turns a number into a string, splits 
		// that string into characters, reverses the list and maps each char back to an int.
		var digits = right.toString().split('').reverse().map(function(x) { return parseInt(x) });
		
		for(var c of digits) {
			// If not first digit add to scale up.
			i += 1
			if (i > 1) {
				s += 1;
			}

			// If the current digit is not zero apply accumulated scale up if any and then 
			// crank forward according to the value of the digit.
			if (c) {
				if (s) {
					this.SCALEUP(s);
					s = 0;
				}
				
				this.CRANKFWDCond(c);
			}
		}
		
		// Reset scale.
		if (this.S > 1) {
			this.SCALEDWN(math.log10(this.S));
		}
		
		this.comment('End Mult R=' + this.R);
	}

	generate_code_BinOp_Div(node) {
		this.comment('Begin Div')
		
		/*
			For Division we want to start with the dividend in
			the R-Register and the divisor in the E-Register.
		*/
		var dividend;
		var divisor;
		
		// Does the divisor require computation?
		if (!node.args[1].isConstantNode) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[1]);

			// Store the value of that to later be set into the E-Register.
			divisor = this.R;
		} else {
			// No. The divisor is an immediate value. Just memorize to
			// later load into E-Register.
			divisor = this.check_operand(node.args[1]);
		}
		
		if (divisor == 0) {
			throw "You tried to make me divide by zero. I am not having that.";
		}
		
		// Does the dividend require computation?
		if (!node.args[0].isConstantNode) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[0]);

			dividend = this.R;
		} else {
			// No. The divisor is an immediate value. Load into E-Register.
			dividend = this.check_operand(node.args[0]);
		}
		
		this.comment('Do Div ' + dividend + '/' + divisor);
		
		// We have divisor and dividend. We need to put the dividend into the
		// R-Register scaled up.
		this.RESETRCond();
		this.SCALEUP(8);
		this.LOADCond(dividend);
		this.CRANKFWDCond(1);
		this.comment('R = ' + this.R);

		// Scale divisor to align with the dividend and load into E-Register
		while (divisor.toString().length < dividend.toString().length) {
			divisor = 10 * divisor;
		}
		
		this.LOADCond(divisor);

		this.RESETUCond();
		
		while (true) {
			// Subtract scaled divisor until zero or negative
			while (this.R > 0) {
				this.CRANKREVCond(1);
			}
			
			if (this.R < 0) {
				// One turn to many, the bell has sounded. Crank forward to correct the underflow.
				this.comment('Ding!');
				this.CRANKFWDCond(1);
			}

			if (this.R == 0) {
				// Done.
				this.comment('Clean zero!');
				break;
			}

			if (this.S == 1) {
				// Sled in 1-position. No point in going on.
				this.comment('Out of decimal places!');
				break;
			}

			// Move sled right one position
			this.SCALEDWN(1);
		}
		
		this.comment('U=' + this.U);
		
		// Move Scale to home position.
		if (this.S > 1) {
			this.SCALEDWN(Math.log10(this.S));
		}
		
		/* 
			The result is in U, but scaled and negative. To be composable we
			want it in R. A human operator would just copy it off. So we do
			the same. The scaling issue we take care of by chopping off trailing
			zeroes. We are happy to have the human figure out where the decimal
			point has to go.
		*/
		var res = (-this.U).toString();
		while (res.substring(res.length,1) == '0') {
			res = res.substring(0,res.length-1);
		}
		
		this.LOADCond(res);
		this.RESETRCond();
		this.CRANKFWDCond(1);

		this.comment('End Div R=' + this.R);
	}
	
	generate_code_BinOp(node) {
		/*
		 We have an operation with two operands to make. Both may
		 be immediately available values (constants) or need a
		 calculation to get them. If we need to calculate them, the
		 result will be in the Resultwerk-Register R.
		
		 For each of the operations and each combination of immediate
		 vs expression there is a preferred way of doing them that
		 minimizes the need for transfer of values between registers
		 or the stack (i.e. to write down intermediate values).
		*/
		
		if (node.op == '+') {
			this.generate_code_BinOp_Add(node);
		} else if (node.op == '-') {
			this.generate_code_BinOp_Sub(node);
		} else if (node.op == '*') {
			this.generate_code_BinOp_Mult(node);
		} else if (node.op == '/') {
			this.generate_code_BinOp_Div(node);
		} else {
			throw ('Don\'t know how to process operation \'' + node.op + '\'');
		}
	}

	generate_code_Num(node) {
		// Put an immediate value into the accumulator.
		this.RESETRCond();
		this.LOADCond(this.check_operand(node));
		this.CRANKFWDCond(1);
	}
	
	generate_code(node) {
		if (node.isConstantNode) {
			this.generate_code_Num(node);
		} else if (node.isParenthesisNode) {
			this.generate_code(node.content);
		} else if (node.isOperatorNode && node.args && (node.args.length==2)) {
			this.generate_code_BinOp(node);
		} else {
			throw 'Don\'t know how to process node \'' +  node.name + '\'';
		}
	}
	
	transform_tree(node) {
		// Apply some transformations to the tree that either make it more palatable
		// to the rest of the code or represent optimizations a basically moronic
		// operator would make. Don't get too clever or you would spoil the experience.
		// The limit case would be to just const-evaluate the whole thing right here.
		
		// First recurse down:		
		for(var childindex in node.args) {
			node.args[childindex] = this.transform_tree(node.args[childindex]);
		}
		
		// Then do the transformations.
		if (node.isOperatorNode && (node.fn=='unaryMinus')) {
			// Replace unary minus with explicit subtraction from 0
			return new math.OperatorNode('-', 'subtract', [new math.ConstantNode(0), node.args[0]]);
		} else if (node.isOperatorNode && (node.op=='+')) {
			// Never add 0 or to 0.
			if (node.args[0].isConstantNode && (node.args[0].value==0)) {
				return node.args[1];
			} else if (node.args[1].isConstantNode && (node.args[1].value==0)) {
				return node.args[0];
			}
		} else if (node.isOperatorNode && (node.op=='-')) {
			// Never subtract 0
			if (node.args[1].isConstantNode && (node.args[1].value==0)) {
				return node.args[0];
			}
		} else if (node.isOperatorNode && (node.op=='*')) {
			// Never multiply by 1.
			if (node.args[0].isConstantNode && (node.args[0].value==1)) {
				return node.args[1];
			} else if (node.args[1].isConstantNode && (node.args[1].value==1)) {
				return node.args[0];
			}
		} else if (node.isOperatorNode && (node.op=='/')) {
			// Never divide by 1
			if (node.args[1].isConstantNode && (node.args[1].value==1)) {
				return node.args[0];
			}
		}
		
		// Anything else returns unmodified.
		return node;
	}
	
	generate_code_from_str(expression) {
		// console.log('generate_code_from_str("' + expression + '")');
		
		var node = math.parse(expression);
		node = this.transform_tree(node);
		
		// console.log(node);
		
		this.generate_code(node);
		this.DONE();
		
		this.comment('Math.js says: ' + node.evaluate().toString()); 
		
		// Return the final result
		return this.R;
	}
}
