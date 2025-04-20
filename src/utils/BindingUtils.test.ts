import assert from 'assert'
import { BindingUtils } from '../utils/BindingUtils';

suite('BindingUtils', () => {
    test('should invoke callback when property is set', (done) => {
        const data = { value: 0 };
        const parent = { data };
        BindingUtils.bind(parent, "data", ( data: { value: number } ) => {
            assert.equal(data.value, 1);
            done();
        });
        data.value = 1;
    });

    test('should invoke callback when array element is pushed', (done) => {
        const data: { items: number[] } = { items: [] };
        const parent = { data };
        BindingUtils.bind(parent, "data", (data: { items: number[] } ) => {
            assert.deepStrictEqual(data.items, [1]);
            done();
        });
        data.items.push(1);
    });

    test('should invoke callback when array element is shifted', (done) => {
        const data: { items: number[] } = { items: [1, 2] };
        const parent = { data };
        BindingUtils.bind(parent, "data", (data: { items: number[] } ) => {
            assert.deepStrictEqual(data.items, [2]);
            done();
        });
        data.items.shift();
    });

    test('should invoke callback when array element is unshifted', (done) => {
        const data: { items: number[] } = { items: [1] };
        const parent = { data };
        BindingUtils.bind(parent, "data", ( data: { items: number[] } ) => {
            assert.deepStrictEqual(data.items, [0, 1]);
            done();
        });
        data.items.unshift(0);
    });

    test('should invoke callback when array element is popped', (done) => {
        const data: { items: number[] } = { items: [1, 2] };
        const parent = { data };
        BindingUtils.bind(parent, "data", (data: { items: number[] } ) => {
            assert.deepStrictEqual(data.items, [1]);
            done();
        });
        data.items.pop();
    });

    test('should unbind callback', () => {
        const data = { value: 0 };
        const parent = { data };
        let callbackInvoked = false;
        function onChange (data: { value: number } )
        {
            callbackInvoked = true;
        }
        BindingUtils.bind(parent, "data", onChange);
        BindingUtils.unbind(data, onChange);
        data.value = 1;
        assert.equal(callbackInvoked, false);
    });

    test('should track nested objects', (done) => {
        const data = { nested: { value: 0 } };
        const parent = { data };
        BindingUtils.bind(parent, "data", (data: { nested: { value: number } }) => {
            assert.equal(data.nested.value, 1);
            done();
        });
        data.nested.value = 1;
    });

    test('should handle multiple callbacks', (done) => {
        const data = { value: 0 };
        const parent = { data };
        let callback1Invoked = false;
        let callback2Invoked = false;

        const checkDone = () => {
            if (callback1Invoked && callback2Invoked) {
                done();
            }
        };

        BindingUtils.bind(parent, "data", (data: { value: number } ) => {
            assert.equal(data.value, 1);
            callback1Invoked = true;
            checkDone();
        });

        BindingUtils.bind(parent, "data", ( data: { value: number } ) => {
            assert.equal(data.value, 1);
            callback2Invoked = true;
            checkDone();
        });

        data.value = 1;
    });

    test('should invoke callback when property is deleted', (done) => {
        const data: { value?: number } = { value: 0 };
        const parent = { data };
        BindingUtils.bind(parent, "data", ( data: { value?: number } ) => {
            assert.equal(data.value, undefined);
            done();
        });
        delete data.value;
    });
});
