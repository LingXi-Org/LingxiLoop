from open_notebook.domain.base import RecordModel


class TestRecordModelSingleton:
    """Test suite for RecordModel singleton behavior."""

    def test_recordmodel_singleton_behavior(self):
        """Test that same instance is returned for same record_id."""

        class TestRecord(RecordModel):
            record_id = "test:singleton"
            value: int = 0

        # Clear any existing instance
        TestRecord.clear_instance()

        # Create first instance
        instance1 = TestRecord(value=42)
        assert instance1.value == 42

        # Create second instance - should return same object
        instance2 = TestRecord(value=99)
        assert instance1 is instance2
        assert instance2.value == 99  # Value was updated

        # Cleanup
        TestRecord.clear_instance()
