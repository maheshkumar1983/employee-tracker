import 'package:flutter_test/flutter_test.dart';
import 'package:android_app/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const EmployeeTrackerApp());
    expect(find.byType(EmployeeTrackerApp), findsOneWidget);
  });
}
