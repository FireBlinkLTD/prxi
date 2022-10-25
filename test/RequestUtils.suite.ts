import { suite, test } from '@testdeck/mocha';
import { equal } from 'assert';
import { RequestUtils } from '../src/utils';

@suite()
export class RequestUtilsSuite {
  @test()
  private testGetPort(): void {
    const portNull = RequestUtils.getPort('http://test');
    const port80 = RequestUtils.getPort('http://test:80');
    const port443 = RequestUtils.getPort('http://test:443/');
    const port8080 = RequestUtils.getPort('http://test:8080/test');

    equal(portNull, null);
    equal(port80, 80);
    equal(port443, 443);
    equal(port8080, 8080);
  }

  @test()
  private testGetHost(): void {
    const hostPortNull = RequestUtils.getHost('http://test');
    const hostPort80 = RequestUtils.getHost('http://test:80');
    const hostPort443 = RequestUtils.getHost('http://test:443/');
    const hostPort8080 = RequestUtils.getHost('http://test:8080/test');

    equal(hostPortNull, 'test');
    equal(hostPort80, 'test');
    equal(hostPort443, 'test');
    equal(hostPort8080, 'test');
  }
}
